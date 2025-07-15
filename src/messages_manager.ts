import { inspect } from "util";

import { Disposable, OutputChannel, StatusBarAlignment, StatusBarItem, window } from "vscode";
import { cloneDeep } from "lodash";

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

class Message {
    constructor(
        public kind: string,
        public text: string,
        public replaceLast: boolean,
        public append: boolean,
        public isNew: boolean,
    ) {}
}

export class MessagesManager implements Disposable {
    private disposables: Disposable[] = [];
    private redrawing = Promise.resolve();

    private statusLine: StatusLine;
    private channel: OutputChannel;

    // True if the message output panel is visible.
    private messageAreaVisible: boolean = false;
    // True if the last redraw event changed the messages.
    private didChange: boolean = false;
    // True if the last message is from message history.
    // History is cleared when new messages appear to avoid confusion.
    private isShowingHistory: boolean = false;
    // Store all ui messages.
    private messages: Message[] = [];

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
                    logger.trace("Message area closed, clearing messages");
                    this.messages = [];
                    this.channel.clear();
                    this.statusLine.setStatus("", StatusType.Msg);
                }
                this.messageAreaVisible = messageAreaVisible;
            }),
            eventBus.on("statusline", ([status]) => this.statusLine.setStatus(status, StatusType.StatusLine)),
        );
    }

    private handleRedraw({ name, args }: EventBusData<"redraw">) {
        switch (name) {
            // "msg_showmode"  would cause a lot of noise in the logs
            case "msg_show":
            case "msg_history_show":
            case "msg_clear":
            case "msg_showcmd":
                logger.trace(`Redraw event: ${name} with args: ${inspect(args, { depth: 5 })}`);
                break;
        }

        switch (name) {
            case "msg_ruler": {
                // useless for now
                break;
            }
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
                if (this.isShowingHistory) {
                    this.isShowingHistory = false;
                    this.messages = [];
                }

                for (const [kind, content, replaceLast, _history, append] of args) {
                    if (kind === "empty") {
                        this.messages = [];
                        this.didChange = true;
                        this.statusLine.setStatus("", StatusType.Msg);
                        continue;
                    }

                    const text = content.map(([_, chunk]) => chunk).join("");
                    const message = new Message(kind, text, replaceLast, append, true);
                    this.messages.push(message);
                }

                break;
            }
            case "msg_history_show": {
                this.isShowingHistory = true;

                this.messages = [];

                for (const [entries] of args) {
                    for (const [_, content] of entries) {
                        const text = content.map(([_, chunk]) => chunk).join("");
                        const message = new Message("", text, false, false, true);
                        this.messages.push(message);
                    }
                }

                break;
            }
            case "msg_clear": {
                this.messages = [];
                this.channel.clear();
                this.statusLine.setStatus("", StatusType.Msg);
                break;
            }
            case "cmdline_show": {
                // Since 'msg_clear' is only emitted after the screen is cleared,
                // there's no appropriate moment to clear the message in the statusline.
                // To address this, clear the statusline message when entering command-line mode,
                // similar to Neovim’s behavior.
                this.statusLine.setStatus("", StatusType.Msg);
                break;
            }
        }

        this.didChange = this.didChange || name === "msg_show" || name === "msg_history_show";
    }

    private async handleFlush() {
        if (!this.didChange) return;

        this.didChange = false;

        this.refreshStatusLineMessage();
        await this.refreshOutputMessages();

        this.messages.forEach((message) => {
            message.isNew = false;
        });
    }

    private mergeMessages(messages: Message[]): Message[] {
        const merged: Message[] = [];
        for (const message of cloneDeep(messages)) {
            if (merged.length > 0 && message.replaceLast) {
                merged[merged.length - 1] = message;
            } else if (merged.length > 0 && message.append) {
                merged[merged.length - 1].text += message.text;
                merged[merged.length - 1].isNew = message.isNew;
            } else {
                merged.push(message);
            }
        }
        return merged;
    }

    private refreshStatusLineMessage() {
        const merged = this.mergeMessages(this.messages);
        const newMsg = merged
            .filter((m) => m.isNew)
            .map((m) => m.text)
            .join("\n");
        this.statusLine.setStatus(newMsg, StatusType.Msg);
    }

    private async refreshOutputMessages() {
        const filtered = this.messages.filter((m) => !IGNORED_KINDS_IN_MESSAGE_AREA.includes(m.kind));
        const merged = this.mergeMessages(filtered);

        const oldMsg = merged
            .filter((m) => !m.isNew)
            .map((m) => m.text)
            .join("\n");
        const newMsg = merged
            .filter((m) => m.isNew)
            .map((m) => m.text)
            .join("\n");

        if (this.messageAreaVisible) {
            // User has already seen the old messages
            this.channel.replace(newMsg);
        } else {
            this.channel.replace(oldMsg ? `${oldMsg}\n\n${newMsg}` : newMsg);
        }

        if (this.isShowingHistory || newMsg.split("\n").length > (await this.getCmdheight())) {
            this.channel.show(true);
        }
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
