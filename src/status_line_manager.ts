import { Disposable, StatusBarAlignment, StatusBarItem, window } from "vscode";

import { config } from "./config";
import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";
import { createLogger } from "./logger";
import { ClearAction, StatusLineMessageTimer } from "./status_line/status_line_message_timer";

const logger = createLogger("StatusLineManager");

const STATUS_MESSAGE_MIN_TIME = 5000;

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
    private messageDisplayTimer: StatusLineMessageTimer;

    private get client() {
        return this.main.client;
    }

    public constructor(private main: MainController) {
        this.statusBar = window.createStatusBarItem("vscode-neovim-status", StatusBarAlignment.Left, -10);
        this.statusBar.show();
        this.messageDisplayTimer = new StatusLineMessageTimer(() => {
            logger.debug("Clearing statusline after timer expiry");
            this.clearMessages();
        }, STATUS_MESSAGE_MIN_TIME);

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
                if (!config.useQuickPickForCmdline) return;
                const [content] = args[0];
                const cmdMsg = this.flattenMessageContent(content);
                this.setStatus(cmdMsg, StatusType.Cmd);
                break;
            }
            case "cmdline_show": {
                if (config.useQuickPickForCmdline) return;
                const [content, _pos, firstc, prompt] = args[0];
                const allContent = content.map(([, str]) => str).join("");
                this.setStatus(`${firstc}${prompt}${allContent}`, StatusType.Cmd);
                break;
            }
            case "cmdline_hide": {
                if (config.useQuickPickForCmdline) return;
                this.setStatus("", StatusType.Cmd);
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
        this.messageDisplayTimer.onMessageEvent();

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

    private handleMsgClear() {
        const action = this.messageDisplayTimer.onClearEvent();
        switch (action) {
            case ClearAction.PerformedClear:
                logger.debug("Clearing statusline after event");
                break;
            case ClearAction.StagedClear:
                logger.debug("Skipping statusline clear as a message is currently pending");
                break;
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

    private clearMessages() {
        this.setStatus("", StatusType.Msg);
    }

    private flattenMessageContent(content: [number, string][]) {
        return content.map(([_code, msg]) => msg).join("");
    }
}
