import { inspect } from "util";

import { Disposable, OutputChannel, StatusBarAlignment, StatusBarItem, window } from "vscode";

import { EXT_ID, EXT_NAME } from "./constants";
import { EventBusData, eventBus } from "./eventBus";
import { createLogger } from "./logger";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";
import { config } from "./config";

const logger = createLogger("MessagesManager");

const CHANNEL_NAME = `${EXT_NAME} messages`;
const IGNORED_KINDS_IN_MESSAGE_AREA = ["bufwrite", "search_cmd", "search_count", "undo"];

enum StatusType {
    Mode, // msg_showmode
    Cmd, // msg_showcmd
    Msg, // msg_show, msg_clear
    StatusLine, // (custom) statusline
}

/**
 * StatusBar wrapper to manage the status line in VSCode
 */
class StatusLine implements Disposable {
    private disposables: Disposable[] = [];

    // ui events items
    private modeText = "";
    private cmdText = "";
    private msgText = "";
    // statusline text
    private statusline = "";

    private statusBar: StatusBarItem;

    public constructor() {
        this.statusBar = window.createStatusBarItem("vscode-neovim-status", StatusBarAlignment.Left, -10);
        this.statusBar.show();

        this.disposables.push(this.statusBar);
    }

    public setStatus(status: string, type: StatusType): void {
        switch (type) {
            case StatusType.Mode:
                this.modeText = status;
                break;
            case StatusType.Cmd:
                this.cmdText = status;
                break;
            case StatusType.Msg:
                this.msgText = status;
                break;
            case StatusType.StatusLine:
                this.statusline = status;
                break;
        }
        this.statusBar.text = [this.statusline, this.modeText, this.cmdText, this.msgText]
            .map((i) => i.replace(/\n/g, " ").trim())
            .filter((i) => i.length)
            .join(config.statusLineSeparator);
    }

    dispose() {
        disposeAll(this.disposables);
    }
}

export class MessagesManager implements Disposable {
    private disposables: Disposable[] = [];
    private redrawing = Promise.resolve();

    private statusLine: StatusLine;
    private channel: OutputChannel;

    private messageBuffer: string[] = [];

    private messageAreaVisible: boolean = false;
    private revealOutput: boolean = false;
    private didChange: boolean = false;

    public constructor(private readonly main: MainController) {
        this.channel = window.createOutputChannel(CHANNEL_NAME);
        this.statusLine = new StatusLine();

        this.disposables.push(
            this.channel,
            this.statusLine,
            // Prevent concurrent redraw / flush by chaining them on a single promise
            eventBus.on("redraw", (e) => {
                this.redrawing = this.redrawing.then(() => this.handleRedraw(e));
            }),
            eventBus.on("flush-redraw", () => {
                this.redrawing = this.redrawing.then(() => this.handleFlush());
            }),
            window.onDidChangeVisibleTextEditors(() => {
                // Simulate the event when the user closes the message output panel.
                // We assume the user has already viewed the messages, so we clear them.
                const messageAreaVisible = window.visibleTextEditors.some(
                    (editor) =>
                        editor.document.uri.scheme === "output" &&
                        editor.document.uri.path.includes(EXT_ID) &&
                        editor.document.uri.path.includes(CHANNEL_NAME),
                );
                if (this.messageAreaVisible !== messageAreaVisible && !messageAreaVisible) {
                    this.messageBuffer = [];
                    this.channel.clear();
                }
                this.messageAreaVisible = messageAreaVisible;
            }),
            eventBus.on("statusline", ([status]) => this.statusLine.setStatus(status, StatusType.StatusLine)),
        );
    }

    private async handleRedraw({ name, args }: EventBusData<"redraw">): Promise<void> {
        switch (name) {
            case "msg_showcmd": {
                const [content] = args[0];
                const cmdMsg = content.map(([_, msg]) => msg).join("");
                this.statusLine.setStatus(cmdMsg, StatusType.Cmd);
                break;
            }
            case "msg_showmode": {
                const [content] = args[0];
                const modeMsg = content.map(([_, msg]) => msg).join("");
                this.statusLine.setStatus(modeMsg, StatusType.Mode);
                break;
            }
            case "msg_show": {
                const [kind, content, replaceLast, _history, append] = args[0];

                if (kind === "empty") {
                    this.messageBuffer = [];
                    this.didChange = true;
                    this.revealOutput = false;
                    this.statusLine.setStatus("", StatusType.Msg);
                    break;
                }

                const newMsg = content.map(([_attrId, chunk]) => chunk).join("");

                const messageBuffer = [...this.messageBuffer];

                if (replaceLast) {
                    messageBuffer.pop();
                }

                if (messageBuffer.length > 0 && append) {
                    messageBuffer[messageBuffer.length - 1] += newMsg;
                } else {
                    messageBuffer.push(newMsg);
                }

                // Always update the status line with the latest message
                this.statusLine.setStatus(messageBuffer[messageBuffer.length - 1], StatusType.Msg);

                if (IGNORED_KINDS_IN_MESSAGE_AREA.includes(kind)) {
                    break;
                }

                this.messageBuffer = messageBuffer;

                // Insert an empty line between new and old messages for better distinction
                if (this.messageBuffer.length > 1) {
                    this.messageBuffer.splice(this.messageBuffer.length - 1, 0, "");
                }

                this.didChange = true;
                const latestMessage = this.messageBuffer[this.messageBuffer.length - 1];
                this.revealOutput = this.revealOutput || latestMessage.split("\n").length > (await this.getCmdheight());

                break;
            }
            case "msg_history_show": {
                const [entries] = args[0];

                this.messageBuffer = entries.map(([_, content]) => content.map(([_, chunk]) => chunk).join(""));
                this.didChange = true;
                this.revealOutput = true;
                break;
            }
            case "msg_clear": {
                this.messageBuffer = [];
                this.channel.clear();
                this.statusLine.setStatus("", StatusType.Msg);
                break;
            }
            default:
                return;
        }

        logger.trace(`Redraw event: ${name} with args: ${inspect(args)}`);
    }

    private handleFlush(): void {
        if (!this.didChange) return;

        this.channel.clear();
        this.messageBuffer.forEach((item) => this.channel.appendLine(item));
        if (this.revealOutput) {
            this.channel.show(true);
        }

        this.didChange = false;
        this.revealOutput = false;
    }

    public async getCmdheight(): Promise<number> {
        let result = 1;
        try {
            result = (await this.main.client.getOption("cmdheight")) as number;
        } catch (e) {
            logger.error("Failed to get cmdheight option:", e);
        }
        return result;
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }
}
