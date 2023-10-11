import { Disposable, OutputChannel, window } from "vscode";

import { EXT_NAME } from "./constants";
import { NeovimRedrawProcessable } from "./neovim_events_processable";

export class MultilineMessagesManager implements Disposable, NeovimRedrawProcessable {
    private disposables: Disposable[] = [];

    private channel: OutputChannel;

    public constructor() {
        this.channel = window.createOutputChannel(`${EXT_NAME}`);
        this.disposables.push(this.channel);
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
        for (const [name, ...args] of batch) {
            switch (name) {
                case "msg_show": {
                    let str = "";
                    for (const [type, content, clear] of args as [string, [number, string][], boolean][]) {
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
                    for (const arg of args as [string, [number, string][]][][][]) {
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
