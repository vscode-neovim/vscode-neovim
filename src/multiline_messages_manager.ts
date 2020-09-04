import { Disposable, OutputChannel, TextEditor, window } from "vscode";

import { Logger } from "./logger";
import { NeovimRedrawProcessable } from "./neovim_events_processable";
import { EXT_NAME } from "./utils";

export class MutlilineMessagesManager implements Disposable, NeovimRedrawProcessable {
    private disposables: Disposable[] = [];

    private channel: OutputChannel;

    private isDisplayed = false;

    public constructor(private logger: Logger) {
        this.channel = window.createOutputChannel(`${EXT_NAME} Messages`);
        this.disposables.push(this.channel);
        this.disposables.push(window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor));
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
                        for (const c of content) {
                            str += c[1] + "\n";
                        }
                    }
                    // remove empty last line (since we always put \n at the end)
                    const lines = str.split("\n").slice(0, -1);
                    if (lines.length > 1) {
                        this.showChannel();
                        this.channel.append(str);
                    }
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
                    this.showChannel();
                    this.channel.append(str);
                    break;
                }
            }
        }
    }

    private showChannel(): void {
        if (this.isDisplayed) {
            return;
        }
        this.isDisplayed = true;
        this.channel.clear();
        this.channel.appendLine("VSCode-Neovim:");
        this.channel.show();
    }

    private hideChannel(): void {
        this.channel.hide();
    }

    private onDidChangeActiveTextEditor = (editor: TextEditor | undefined): void => {
        if (!editor || !this.isEditorIsChannel(editor)) {
            if (this.isDisplayed) {
                this.hideChannel();
            }
            this.isDisplayed = false;
        } else {
            this.isDisplayed = true;
        }
    };

    private isEditorIsChannel(editor: TextEditor): boolean {
        const doc = editor.document;
        if (doc.uri.scheme !== "output") {
            return false;
        }
        const line = doc.lineAt(0);
        // no other way i'm aware of to check if a document is the our channel document
        if (line.text.startsWith("VSCode-Neovim:")) {
            return true;
        }
        return false;
    }
}
