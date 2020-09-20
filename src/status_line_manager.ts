import { NeovimClient } from "neovim";
import { Disposable } from "vscode";

import { Logger } from "./logger";
import { NeovimRedrawProcessable } from "./neovim_events_processable";
import { StatusLineController } from "./status_line";

export class StatusLineManager implements Disposable, NeovimRedrawProcessable {
    private disposables: Disposable[] = [];
    /**
     * Status var UI
     */
    private statusLine: StatusLineController;

    public constructor(private logger: Logger, private client: NeovimClient) {
        this.statusLine = new StatusLineController();
        this.disposables.push(this.statusLine);
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
        let acceptPrompt = false;
        // if there is mouse_on event after return prompt, then we don't need automatically accept it
        // use case: easymotion search with jumping
        let hasMouseOnAfterReturnPrompt = false;
        batch.forEach(([name, ...args], idx) => {
            // for (const [name, ...args] of batch) {
            const firstArg = args[0] || [];
            switch (name) {
                case "msg_showcmd": {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const [content] = firstArg as [string, any[]];
                    let str = "";
                    if (content) {
                        for (const c of content) {
                            const [, cmdStr] = c;
                            if (cmdStr) {
                                str += cmdStr;
                            }
                        }
                    }
                    this.statusLine.statusString = str;
                    break;
                }
                case "msg_show": {
                    let str = "";
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    for (const [type, content] of args as [string, any[], never][]) {
                        // if (ui === "confirm" || ui === "confirmsub" || ui === "return_prompt") {
                        //     this.nextInputBlocking = true;
                        // }
                        if (type === "return_prompt") {
                            acceptPrompt = true;
                            hasMouseOnAfterReturnPrompt = !!batch.slice(idx).find(([name]) => name === "mouse_on");
                        }
                        if (content) {
                            for (const c of content) {
                                const [, cmdStr] = c;
                                if (cmdStr) {
                                    str += cmdStr;
                                }
                            }
                        }
                    }
                    this.statusLine.msgString = str;
                    break;
                }
                case "msg_showmode": {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const [content] = firstArg as [any[]];
                    let str = "";
                    if (content) {
                        for (const c of content) {
                            const [, modeStr] = c;
                            if (modeStr) {
                                str += modeStr;
                            }
                        }
                    }
                    this.statusLine.modeString = str;
                    break;
                }
                case "msg_clear": {
                    this.statusLine.msgString = "";
                    break;
                }
            }
        });
        if (acceptPrompt && !hasMouseOnAfterReturnPrompt) {
            this.client.input("<CR>");
        }
    }
}
