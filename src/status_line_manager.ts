import { Disposable, StatusBarAlignment, StatusBarItem, window } from "vscode";

import { config } from "./config";
import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";

enum StatusType {
    Mode, // msg_showmode
    Cmd, // msg_showcmd
    Msg, // msg_show, msg_clear
    StatusLine, // (custom) statusline
}

export class StatusLineManager implements Disposable {
    private disposables: Disposable[] = [];

    // ui events
    private _modeText = "";
    private _cmdText = "";
    private _msgText = "";

    private _statusline = "";

    private statusBar: StatusBarItem;

    private get client() {
        return this.main.client;
    }

    public constructor(private main: MainController) {
        this.statusBar = window.createStatusBarItem("vscode-neovim-status", StatusBarAlignment.Left, -10);
        this.statusBar.show();
        this.disposables.push(
            this.statusBar,
            eventBus.on("redraw", this.handleRedraw, this),
            eventBus.on("statusline", ([status]) => this.setStatus(status, StatusType.StatusLine)),
        );
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
            case StatusType.StatusLine:
                this._statusline = status;
                break;
        }
        this.updateStatus();
    }

    private updateStatus() {
        this.statusBar.text = [this._statusline, this._modeText, this._cmdText, this._msgText]
            .map((i) => i.replace(/\n/g, " ").trim())
            .filter((i) => i.length)
            .join(config.statusLineSeparator);
    }

    private handleRedraw({ name, args }: EventBusData<"redraw">) {
        let acceptPrompt = false;

        switch (name) {
            case "msg_showcmd": {
                const [content] = args[0];
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
                const [content] = args[args.length - 1];
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
        if (acceptPrompt) {
            this.client.input("<CR>");
        }
    }

    dispose() {
        disposeAll(this.disposables);
    }
}
