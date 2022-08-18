import { NeovimClient } from "neovim";
import { Disposable } from "vscode";

import { CommandLineController } from "./command_line";
import { Logger } from "./logger";
import { NeovimRedrawProcessable } from "./neovim_events_processable";
import { normalizeInputString } from "./utils";

export class CommandLineManager implements Disposable, NeovimRedrawProcessable {
    private disposables: Disposable[] = [];
    /**
     * Simple command line UI
     */
    private commandLine?: CommandLineController;
    /**
     * Commandline timeout
     */
    private cmdlineTimer?: NodeJS.Timeout;

    public constructor(private logger: Logger, private client: NeovimClient) {}

    public dispose(): void {
        if (this.commandLine) {
            this.commandLine.dispose();
        }
        this.disposables.forEach((d) => d.dispose());
    }

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
        for (const [name, ...args] of batch) {
            const firstArg = args[0] || [];
            switch (name) {
                case "cmdline_show": {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const [content, pos, firstc, prompt, indent, level] = firstArg as [
                        // eslint-disable-next-line @typescript-eslint/ban-types
                        [object, string][],
                        number,
                        string,
                        string,
                        number,
                        number,
                    ];
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
                    const [items] = firstArg as [string[]];
                    if (this.commandLine) {
                        this.commandLine.setCompletionItems(items);
                    }
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
            this.commandLine = new CommandLineController(this.logger, this.client, {
                onAccepted: this.onCmdAccept,
                onCanceled: this.onCmdCancel,
                onChanged: this.onCmdChange,
            });
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
