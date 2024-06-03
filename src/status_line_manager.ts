import { Disposable, StatusBarAlignment, StatusBarItem, window } from "vscode";

import { config } from "./config";
import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll, Timer } from "./utils";
import { createLogger } from "./logger";

const logger = createLogger("StatusLineManager");

enum StatusType {
    Mode, // msg_showmode
    Cmd, // msg_showcmd
    Msg, // msg_show, msg_clear
    StatusLine, // (custom) statusline
}

const STATUS_MESSAGE_MIN_TIME = 5000;

export class StatusLineManager implements Disposable {
    private disposables: Disposable[] = [];

    // ui events
    private _modeText = "";
    private _cmdText = "";
    private _msgText = "";

    private _statusline = "";

    private statusBar: StatusBarItem;
    // Used to ensure messages display for some minimum amount of time so that clears don't hide just-sent messages
    private messageDisplayTimer: Timer;
    private clearPending: boolean = false;

    private get client() {
        return this.main.client;
    }

    public constructor(private main: MainController) {
        this.statusBar = window.createStatusBarItem("vscode-neovim-status", StatusBarAlignment.Left, -10);
        this.statusBar.show();
        this.messageDisplayTimer = new Timer(() => this.handleMessageTimerExpiry(), STATUS_MESSAGE_MIN_TIME);

        this.disposables.push(
            this.statusBar,
            this.messageDisplayTimer,
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
        switch (name) {
            case "msg_showcmd": {
                const [content] = args[0];
                const cmdMsg = this.flattenMessageContent(content);
                this.setStatus(cmdMsg, StatusType.Cmd);
                break;
            }
            case "msg_show": {
                this.handleMsgShow({ name, args });
                break;
            }
            case "msg_showmode": {
                const [content] = args[args.length - 1];
                const modeMsg = this.flattenMessageContent(content);
                this.setStatus(modeMsg, StatusType.Mode);
                break;
            }
            case "msg_clear": {
                this.handleMsgClear();
                break;
            }
        }
    }

    dispose() {
        disposeAll(this.disposables);
    }

    private handleMsgShow({ name, args }: EventBusData<"redraw">) {
        if (name !== "msg_show") {
            throw new Error("Expected a msg_show event");
        }

        this.ensurePressEnterCleared({ name, args });
        this.startMessageDisplayTimer();

        const msg = args.reduce((str, [type, content, replace]) => {
            // There's no reason to put "Press ENTER to continue" in the status line
            if (type === "return_prompt") {
                return str;
            }

            const flattenedContent = content.map(([_code, msg]) => msg).join("");
            if (replace) {
                return flattenedContent;
            }

            return str + flattenedContent;
        }, "");

        this.setStatus(msg, StatusType.Msg);
    }

    private startMessageDisplayTimer() {
        this.messageDisplayTimer.restart();
        this.clearPending = false;
    }

    private handleMsgClear() {
        if (this.messageDisplayTimer.isPending()) {
            logger.debug("Skipping statusline clear as a message is currently pending");
            this.clearPending = true;
        } else {
            logger.debug("Clearing statusline after event");
            this.clearMessages();
        }
    }

    private ensurePressEnterCleared({ name, args }: EventBusData<"redraw">) {
        if (name !== "msg_show") {
            throw new Error("Expected a msg_show event");
        }

        const returnPrompt = args.find(([type, _content]) => type === "return_prompt");
        if (returnPrompt) {
            this.client.input("<CR>");
        }
    }

    private handleMessageTimerExpiry() {
        if (this.clearPending) {
            this.clearMessages();
        }

        this.clearPending = false;
    }

    private clearMessages() {
        this.setStatus("", StatusType.Msg);
    }

    private flattenMessageContent(content: [number, string][]) {
        return content.map(([_code, msg]) => msg).join("");
    }
}
