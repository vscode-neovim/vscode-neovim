import { Disposable, OutputChannel } from "vscode";

import { EventBusData, eventBus } from "./eventBus";
import { disposeAll } from "./utils";
import { createLogger } from "./logger";

const logger = createLogger("MessagesManager");

export class MessagesManager implements Disposable {
    private disposables: Disposable[] = [];

    public constructor(readonly channel: OutputChannel) {
        eventBus.on("redraw", this.handleRedraw, this, this.disposables);
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }

    private handleRedraw({ name, args }: EventBusData<"redraw">): void {
        switch (name) {
            case "msg_show": {
                const lines: string[] = [];
                for (const [type, content, clear] of args) {
                    if (type === "return_prompt") {
                        continue;
                    }

                    if (clear) {
                        // Remove all stored lines, we will clear the output console on the way out.
                        lines.splice(0, lines.length);
                    }

                    const segments = content.map((c) => c[1]);
                    if (segments.length > 0) {
                        segments[0] = segments[0].replace(/^\n+/, "");
                    }

                    lines.push(...segments);
                }

                if (lines.length >= 2) {
                    this.channel.show(true);
                }

                this.writeMessage(lines.join("\n"));
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
