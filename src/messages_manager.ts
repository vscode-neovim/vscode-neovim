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

        this.disposables.push(redrawHandler, flushHandler, this.channel);
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }

    private handleRedraw({ name, args }: EventBusData<"redraw">): void {
        switch (name) {
            case "msg_show": {
                for (const [kind, content, replaceLast] of args) {
                    // Ignore return_prompt
                    //
                    // A note to future readers: return_prompt is sent much more often with ui_messages. It may
                    // not do what you expect from what :help ui says, so be careful about using these events.
                    // See: https://github.com/vscode-neovim/vscode-neovim/issues/2046#issuecomment-2144175058
                    if (kind === "return_prompt") continue;

                    // An `empty` message (`:echo ""`) has no content. Skipping it clears the output when it is the only
                    // message of the batch, and otherwise leaves the other messages alone.
                    if (kind === "empty") continue;

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
                // Nvim cleared the screen (`CTRL-L`, `:mode`).
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
                // Nvim 0.11 and older: this does not actually correspond to the `:messages clear`
                // command, but to when neovim wants us to clear our history buffer.
                this.historyBuffer = [];
                break;

            case "cmdline_hide":
                // Leaving the cmdline resets Nvim's message area, so the output must be
                // rewritten even for a command that emits nothing, e.g. `:messages` with
                // an empty history.
                break;

            default:
                return;
        }

        switch (name) {
            case "msg_clear":
            case "msg_history_clear":
                // Dropping staged text is not a change to write. Nvim 0.11 and older emit
                // these after a message batch as well, where a rewrite would blank the panel
                // instead of showing the messages.
                break;

            default:
                this.didChange = true;
        }

        logger.trace(name, inspect(args, { depth: 5, compact: 3 }));
    }

    private async handleFlush(): Promise<void> {
        if (!this.didChange) {
            // A redraw without a message means Nvim's message area is idle, so the next msg_show belongs to a new
            // batch. Nvim does not announce this with msg_clear. The channel still keeps its text.
            this.messageBuffer = [];
            this.historyBuffer = [];
            return;
        }

        const messages = this.displayHistory ? this.historyBuffer : this.messageBuffer;
        logger.trace(`Flushing ${this.displayHistory ? "history" : "message"} buffer: ${inspect(messages)}`);

        const msg = messages.join("\n");

        const lineCount = msg.split("\n").length;
        const cmdheight = (await this.main.client.getOption("cmdheight")) as number;
        const shouldRevealOutput = this.revealOutput || lineCount > cmdheight;

        const { didChange, revealOutput, displayHistory } = this;
        logger.trace(inspect({ didChange, revealOutput, displayHistory, lineCount }));

        this.writeMessage(this.ensureEOL(msg));
        if (shouldRevealOutput) {
            this.channel.show(true);
        }

        // Reset all the state for the next batch of redraw messages. The staging buffers
        // are kept, bc a single batch can span several flushes: `:echom 1 | sleep 1 | echom 2`.
        this.didChange = false;
        this.displayHistory = false;
        this.revealOutput = false;
    }

    private writeMessage(msg: string): void {
        logger.info(inspect(msg));
        // We use clear() before replace() because the latter is a noop
        // for falsy values but we always want to clear to match nvim behavior.
        this.channel.clear();
        // And, we use append here instead of replace because append seems to
        // take longer, which sometimes results in an empty panel if we reveal
        // the (previously hidden) panel immediately afterward, particularly for
        // large outputs.
        this.channel.replace(msg);
    }

    private ensureEOL(msg: string): string {
        if (msg.length === 0 || msg[msg.length - 1] === "\n") {
            return msg;
        }

        return msg + "\n";
    }
}
