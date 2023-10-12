import { Disposable } from "vscode";

import { MainController } from "./main_controller";
import { StatusLineController } from "./status_line";
import { EventBusData, eventBus } from "./eventBus";

export class StatusLineManager implements Disposable {
    private disposables: Disposable[] = [];
    /**
     * Status var UI
     */
    private statusLine: StatusLineController;

    private get client() {
        return this.main.client;
    }

    public constructor(private main: MainController) {
        this.statusLine = new StatusLineController();
        this.disposables.push(this.statusLine);
        eventBus.on("redraw", this.handleRedraw, this, this.disposables);
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    private handleRedraw(data: EventBusData<"redraw">) {
        let acceptPrompt = false;

        // if there is mouse_on event after return prompt, then we don't need automatically accept it
        // use case: easymotion search with jumping
        let hasMouseOnAfterReturnPrompt = false;
        data.forEach(({ name, args, lastArg, firstArg }, idx) => {
            switch (name) {
                case "msg_showcmd": {
                    const [content] = firstArg;
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
                    for (const [type, content] of args) {
                        // if (ui === "confirm" || ui === "confirmsub" || ui === "return_prompt") {
                        //     this.nextInputBlocking = true;
                        // }
                        if (type === "return_prompt") {
                            acceptPrompt = true;
                            hasMouseOnAfterReturnPrompt = !!data.slice(idx).find(({ name }) => name === "mouse_on");
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
                    const [content] = lastArg;
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
