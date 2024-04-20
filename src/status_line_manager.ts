import { Disposable, StatusBarAlignment, StatusBarItem, window } from "vscode";

import { config } from "./config";
import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";

enum StatusType {
    Mode, // msg_showmode
    Cmd, // msg_showcmd
    Msg, // msg_show, msg_clear
}

export class StatusLineManager implements Disposable {
    private disposables: Disposable[] = [];

    // ui events
    private _modeText = "";
    private _cmdText = "";
    private _msgText = "";

    private statusBar: StatusBarItem;

    private nvimStatusLine = "";

    private get client() {
        return this.main.client;
    }

    public constructor(private main: MainController) {
        this.statusBar = window.createStatusBarItem(StatusBarAlignment.Left, -10);
        this.statusBar.show();
        this.disposables.push(this.statusBar, eventBus.on("redraw", this.handleRedraw, this));

        const refreshNvimStatusLineTimer = setInterval(async () => {
            let sl = (await this.client.lua(`
            if vim.o.laststatus == 0 then return "" end
            return vim.api.nvim_eval_statusline(vim.o.statusline, {}).str
            `)) as any as string;
            sl = sl.replace(/\n/g, " ").split(/\s+/g).join(" ");
            if (this.nvimStatusLine !== sl) {
                this.nvimStatusLine = sl;
                this.updateStatus();
            }
        }, 120);
        this.disposables.push(new Disposable(() => clearInterval(refreshNvimStatusLineTimer)));
    }

    private setStatus(status: string, type: StatusType): void {
        switch (type) {
            case StatusType.Mode:
                this._modeText = status;
                break;
            case StatusType.Cmd:
                this._cmdText = status;
                break;
            case StatusType.Msg:
                this._msgText = status;
                break;
        }
        this.updateStatus();
    }

    private updateStatus() {
        this.statusBar.text = [this.nvimStatusLine, this._modeText, this._cmdText, this._msgText]
            .map((i) => i.replace(/\n/g, " ").trim())
            .filter((i) => i.length)
            .join(config.statusLineSeparator);
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
                    this.setStatus(str, StatusType.Cmd);
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
                    this.setStatus(str, StatusType.Msg);
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
                    this.setStatus(str, StatusType.Mode);
                    break;
                }
                case "msg_clear": {
                    this.setStatus("", StatusType.Msg);
                    break;
                }
            }
        });
        if (acceptPrompt && !hasMouseOnAfterReturnPrompt) {
            this.client.input("<CR>");
        }
    }

    dispose() {
        disposeAll(this.disposables);
    }
}
