import { Disposable, OutputChannel, window } from "vscode";

import { EXT_NAME } from "./constants";
import { EventBusData, eventBus } from "./eventBus";
import { disposeAll } from "./utils";

export class MultilineMessagesManager implements Disposable {
    private disposables: Disposable[] = [];

    private channel: OutputChannel;

    public constructor() {
        this.channel = window.createOutputChannel(`${EXT_NAME}`);
        this.disposables.push(this.channel);
        eventBus.on("redraw", this.handleRedraw, this, this.disposables);
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }

    private handleRedraw(data: EventBusData<"redraw">): void {
        for (const { name, args } of data) {
            switch (name) {
                case "msg_show": {
                    let str = "";
                    for (const [type, content, clear] of args) {
                        if (type === "return_prompt") {
                            continue;
                        }
                        if (clear) {
                            this.channel.clear();
                            str = "";
                        }
                        let contentStr = "";
                        for (const c of content) {
                            contentStr += c[1];
                        }
                        // sometimes neovim sends linebreaks, sometimes not ¯\_(ツ)_/¯
                        str += (contentStr[0] === "\n" ? "" : "\n") + contentStr;
                    }
                    // remove empty last line (since we always put \n at the end)
                    const lines = str.split("\n").slice(1);
                    if (lines.length > 2) {
                        this.channel.show(true);
                    }
                    this.channel.append(str);
                    break;
                }
                case "msg_history_show": {
                    let str = "\n";
                    for (const arg of args) {
                        for (const list of arg) {
                            for (const [commandName, content] of list) {
                                let cmdContent = "";
                                for (const c of content) {
                                    cmdContent += c[1];
                                }
                                str += `${commandName}: ${cmdContent}\n`;
                            }
                        }
                    }
                    this.channel.show(true);
                    this.channel.append(str);
                    break;
                }
            }
        }
    }
}
