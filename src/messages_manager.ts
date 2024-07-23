import { inspect } from "util";

import { Disposable, OutputChannel, window } from "vscode";

import { EXT_NAME } from "./constants";
import { EventBusData, eventBus } from "./eventBus";
import { createLogger } from "./logger";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";

const logger = createLogger("MessagesManager");

export class MessagesManager implements Disposable {
    private disposables: Disposable[] = [];
    private channel: OutputChannel;

    private redrawing = Promise.resolve();

    private revealOutput: boolean = false;
    private replaceOutput: boolean = false;
    private displayHistory: boolean = false;
    private didChange: boolean = false;

    private messageBuffer: string[] = [];
    private historyBuffer: string[] = [];

    public constructor(private readonly main: MainController) {
        this.channel = window.createOutputChannel(`${EXT_NAME} messages`);

        // Prevent concurrent redraw / flush by chaining them on a single promise:
        const redrawHandler = eventBus.on("redraw", (e) => {
            this.redrawing = this.redrawing.then(() => this.handleRedraw(e));
        });
        const flushHandler = eventBus.on("flush-redraw", () => {
            this.redrawing = this.redrawing.then(() => this.handleFlush());
        });

        this.disposables.push(redrawHandler, flushHandler);
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }

    private async handleRedraw({ name, args }: EventBusData<"redraw">): Promise<void> {
        switch (name) {
            case "msg_show": {
                let lineCount = 0;

                for (const [type, content, replaceLast] of args) {
                    // Ignore return_prompt
                    //
                    // A note to future readers: return_prompt is sent much more often with ui_messages. It may
                    // not do what you expect from what :help ui says, so be careful about using these events.
                    // See: https://github.com/vscode-neovim/vscode-neovim/issues/2046#issuecomment-2144175058
                    if (type === "return_prompt") {
                        this.replaceOutput = true;
                        continue;
                    }

                    // NOTE: we could also potentially handle e.g. `echoerr` differently here,
                    // like logging at error level or displaying a toast etc.

                    const text = content.map(([_attrId, chunk]) => chunk).join("");
                    if (replaceLast) {
                        this.messageBuffer.pop();
                    }
                    this.messageBuffer.push(text);

                    lineCount += text.split("\n").length;
                }

                const cmdheight = (await this.main.client.getOption("cmdheight")) as number;
                // Before Nvim 0.10, cmdheight is unchangeable, and it's always 0.
                this.revealOutput ||= lineCount > Math.max(1, cmdheight);
                break;
            }

            case "msg_clear": {
                this.messageBuffer = [];
                break;
            }

            case "msg_history_show": {
                for (const arg of args) {
                    for (const list of arg) {
                        for (const [commandName, content] of list) {
                            const cmdContent = content.map(([_attrId, chunk]) => chunk).join("");

                            if (commandName.length === 0) {
                                this.historyBuffer.push(cmdContent);
                            } else {
                                this.historyBuffer.push(`${commandName}: ${cmdContent}`);
                            }
                        }
                    }
                }

                this.displayHistory = true;
                this.replaceOutput = true;
                this.revealOutput = true;
                break;
            }

            case "msg_history_clear": {
                this.historyBuffer = [];
                this.replaceOutput = true;
                break;
            }

            default:
                return;
        }

        this.didChange = true;
        logger.trace(name, inspect(args, { depth: 5, compact: 3 }));
    }

    private handleFlush(): void {
        if (!this.didChange) return;

        const messages = this.displayHistory ? this.historyBuffer : this.messageBuffer;
        logger.trace(`Flushing ${this.displayHistory ? "history " : ""}message buffer: ${inspect(messages)}`);
        const msg = this.ensureEOL(messages.join("\n"));

        this.writeMessage(msg);
        if (this.revealOutput) {
            this.channel.show(true);
        }

        // Reset all the state for the next batch of redraw messages
        this.didChange = false;
        this.displayHistory = false;
        this.revealOutput = false;
        this.replaceOutput = false;
    }

    private writeMessage(msg: string): void {
        if (msg.length > 0) {
            logger.info(inspect(msg));
        }

        if (this.replaceOutput) {
            this.channel.replace(msg);
        } else if (msg.length !== 0) {
            this.channel.append(msg);
        }
    }

    private ensureEOL(msg: string): string {
        if (msg.length === 0 || msg[msg.length - 1] === "\n") {
            return msg;
        }

        return msg + "\n";
    }
}
