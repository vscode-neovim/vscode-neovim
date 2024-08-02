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

    private handleRedraw({ name, args }: EventBusData<"redraw">): void {
        switch (name) {
            case "msg_show": {
                for (const [type, content, replaceLast] of args) {
                    // A note to future readers: return_prompt is sent much more often with ui_messages. It may
                    // not do what you expect from what :help ui says, so be careful about using these events.
                    // See: https://github.com/vscode-neovim/vscode-neovim/issues/2046#issuecomment-2144175058
                    if (type === "return_prompt") {
                        // This kinda mimics normal neovim behavior, but it's not exactly the
                        // same because we still don't require a keypress/hide the panel afterwards.
                        this.revealOutput = true;
                        continue;
                    }

                    // NOTE: we could also potentially handle e.g. `echoerr` differently here,
                    // like logging at error level or displaying a toast etc.

                    const text = content.map(([_attrId, chunk]) => chunk).join("");
                    if (replaceLast) {
                        this.messageBuffer.pop();
                    }
                    this.messageBuffer.push(text);
                }
                break;
            }

            case "msg_clear": {
                this.messageBuffer = [];
                break;
            }

            case "msg_history_show": {
                for (const [entries] of args) {
                    for (const [commandName, content] of entries) {
                        const cmdContent = content.map(([_attrId, chunk]) => chunk).join("");

                        if (commandName.length === 0) {
                            this.historyBuffer.push(cmdContent);
                        } else {
                            this.historyBuffer.push(`${commandName}: ${cmdContent}`);
                        }
                    }
                }

                this.displayHistory = true;
                this.revealOutput = true;
                break;
            }

            case "msg_history_clear":
                // NOTE: this does not actually correspond to the `:messages clear`
                // command, but to when neovim wants us to clear our history buffer.
                this.historyBuffer = [];
                break;

            default:
                return;
        }

        switch (name) {
            case "msg_clear":
            case "msg_history_clear":
                // These clear messages are often followed by a flush whenever neovim
                // thinks it's "done" showing those messages, resulting in an empty output
                // panel instead of the desired display. To avoid flushing the now-empty
                // buffer, we skip setting didChange so the flush becomes a no-op.
                // Seems likely caused by/related to https://github.com/neovim/neovim/issues/20416
                break;

            default:
                this.didChange = true;
        }

        logger.trace(name, inspect(args, { depth: 5, compact: 3 }));
    }

    private async handleFlush(): Promise<void> {
        if (!this.didChange) return;

        const messages = this.displayHistory ? this.historyBuffer : this.messageBuffer;
        logger.trace(`Flushing ${this.displayHistory ? "history" : "message"} buffer: ${inspect(messages)}`);

        const msg = messages.join("\n");

        const lineCount = msg.split("\n").length;
        const cmdheight = (await this.main.client.getOption("cmdheight")) as number;
        // Before Nvim 0.10, cmdheight is unchangeable, and it's always 0.
        const shouldReveal = this.revealOutput || lineCount > Math.max(1, cmdheight);

        const { didChange, revealOutput, displayHistory } = this;
        logger.trace(inspect({ didChange, revealOutput, displayHistory, lineCount }));

        this.writeMessage(this.ensureEOL(msg));
        if (shouldReveal) {
            this.channel.show(true);
        }

        // Reset all the state for the next batch of redraw messages
        this.didChange = false;
        this.displayHistory = false;
        this.revealOutput = false;
    }

    private writeMessage(msg: string): void {
        logger.info(inspect(msg));
        // We use clear() instead of replace() because the latter is a noop
        // for falsy values but we always want to clear to match nvim behavior.
        this.channel.clear();
        this.channel.append(msg);
    }

    private ensureEOL(msg: string): string {
        if (msg.length === 0 || msg[msg.length - 1] === "\n") {
            return msg;
        }

        return msg + "\n";
    }
}
