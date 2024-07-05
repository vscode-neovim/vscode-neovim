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

    public constructor(private readonly main: MainController) {
        this.channel = window.createOutputChannel(`${EXT_NAME} messages`);
        this.disposables.push(this.channel, eventBus.on("redraw", this.handleRedraw, this));
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }

    private async handleRedraw({ name, args }: EventBusData<"redraw">): Promise<void> {
        switch (name) {
            case "msg_show": {
                const hasReturnPrompt = args.some(([type]) => type === "return_prompt");
                const msg = args.reduce((acc, [type, content, clear]) => {
                    // Ignore return_prompt
                    //
                    // A note to future readers: return_prompt is sent much more often with ui_messages. It may
                    // not do what you expect from what :help ui says, so be careful about using these events.
                    // See: https://github.com/vscode-neovim/vscode-neovim/issues/2046#issuecomment-2144175058
                    if (type === "return_prompt") return acc;
                    if (clear) return "";
                    return acc + content.map((c) => c[1]).join("");
                }, "");
                const outputMsg = hasReturnPrompt ? msg.replace(/\n$/, "") : msg;

                this.writeMessage(outputMsg);

                const lineCount = outputMsg.split("\n").length;
                const cmdheight = (await this.main.client.getOption("cmdheight")) as number;
                // Before Nvim 0.10, cmdheight is unchangeable, and it's always 0.
                if (lineCount > Math.max(1, cmdheight)) {
                    this.channel.show(true);
                }

                break;
            }

            case "msg_history_show": {
                const lines = [];
                for (const arg of args) {
                    for (const list of arg) {
                        for (const [commandName, content] of list) {
                            const cmdContent = content.map((c) => c[1]).join("");

                            if (commandName.length === 0) {
                                lines.push(cmdContent);
                            } else {
                                lines.push(`${commandName}: ${cmdContent}`);
                            }
                        }
                    }
                }

                this.channel.show(true);
                this.writeMessage(lines.join("\n"));
                break;
            }
        }
    }

    private writeMessage(msg: string): void {
        if (msg.length === 0) {
            return;
        }

        logger.info(msg);
        const outputMsg = this.ensureEOL(msg);
        this.channel.replace(outputMsg);
    }

    private ensureEOL(msg: string): string {
        if (msg.length === 0 || msg[msg.length - 1] === "\n") {
            return msg;
        }

        return msg + "\n";
    }
}
