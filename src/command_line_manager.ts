import { Disposable } from "vscode";

import { CommandLineController } from "./command_line";
import { config } from "./config";
import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll, normalizeInputString } from "./utils";

export class CommandLineManager implements Disposable {
    private disposables: Disposable[] = [];
    /**
     * Simple command line UI
     */
    private commandLine?: CommandLineController;
    /**
     * Commandline timeout
     */
    private cmdlineTimer?: NodeJS.Timeout;

    private get client() {
        return this.main.client;
    }

    public constructor(private main: MainController) {
        eventBus.on("redraw", this.handleRedraw, this, this.disposables);
    }

    public dispose() {
        this.commandLine?.dispose();
        disposeAll(this.disposables);
    }

    private handleRedraw(data: EventBusData<"redraw">) {
        for (const { name, args } of data) {
            switch (name) {
                case "cmdline_show": {
                    const [content, _pos, firstc, prompt, _indent, _level] = args[0];
                    const allContent = content.map(([, str]) => str).join("");
                    // !note: neovim can send cmdline_hide followed by cmdline_show events
                    // !since quickpick can be destroyed slightly at later time after handling cmdline_hide we want to create new command line
                    // !controller and input for every visible cmdline_show event
                    // !otherwise we may hit cmdline_show when it's being hidden
                    // as alternative, it's possible to process batch and determine if we need show/hide or just redraw the command_line
                    // but this won't handle the case when cmdline_show comes in next flush batch (is it possible?)
                    // btw, easier to just recreate whole command line (and quickpick inside)
                    if (this.cmdlineTimer) {
                        clearTimeout(this.cmdlineTimer);
                        this.cmdlineTimer = undefined;
                        this.showCmd(allContent, firstc, prompt);
                    } else {
                        // if there is initial content and it's not currently displayed then it may come
                        // from some mapping. to prevent bad UI commandline transition we delay cmdline appearing here
                        if (allContent !== "" && allContent !== "'<,'>" && !this.commandLine) {
                            this.cmdlineTimer = setTimeout(() => this.showCmdOnTimer(allContent, firstc, prompt), 200);
                        } else {
                            this.showCmd(allContent, firstc, prompt);
                        }
                    }
                    break;
                }
                case "wildmenu_show": {
                    this.commandLine?.setCompletionItems(args[0][0]);
                    break;
                }
                case "wildmenu_hide": {
                    this.commandLine?.setCompletionItems([]);
                    break;
                }
                case "cmdline_hide": {
                    if (this.cmdlineTimer) {
                        clearTimeout(this.cmdlineTimer);
                        this.cmdlineTimer = undefined;
                    } else if (this.commandLine) {
                        this.commandLine.cancel(true);
                        this.commandLine.dispose();
                        this.commandLine = undefined;
                    }
                    break;
                }
            }
        }
    }

    private showCmd = (content: string, firstc: string, prompt: string): void => {
        if (!this.commandLine) {
            this.commandLine = new CommandLineController(
                this.client,
                {
                    onAccepted: this.onCmdAccept,
                    onCanceled: this.onCmdCancel,
                    onChanged: this.onCmdChange,
                },
                config.completionDelay,
            );
        }
        this.commandLine.show(content, firstc, prompt);
    };

    private showCmdOnTimer = (initialContent: string, firstc: string, prompt: string): void => {
        this.showCmd(initialContent, firstc, prompt);
        this.cmdlineTimer = undefined;
    };

    private onCmdChange = async (e: string, complete: boolean): Promise<void> => {
        let keys = "<C-u>" + normalizeInputString(e);
        if (complete) {
            keys += "<C-e>";
        }
        await this.client.input(keys);
    };

    private onCmdCancel = async (): Promise<void> => {
        await this.client.input("<Esc>");
    };

    private onCmdAccept = (): void => {
        this.client.input("<CR>");
    };
}
