import { NeovimClient } from "neovim";
import { Disposable, QuickPick, QuickPickItem, commands, window } from "vscode";

import { GlyphChars } from "../constants";
import { createLogger } from "../logger";
import { disposeAll } from "../utils";

const logger = createLogger("CmdLine");

export interface CommandLineCallbacks {
    onAccepted(): void;
    onChanged(str: string): void;
    onCanceled(): void;
}

export class CommandLineController implements Disposable {
    public isDisplayed = false;

    private input: QuickPick<QuickPickItem>;

    private disposables: Disposable[] = [];

    private ignoreHideEvent = false;

    private redrawExpected = false; // whether to accept incoming cmdline_show

    private updatedFromNvim = false; // whether to replace nvim cmdline with new content

    public constructor(
        private client: NeovimClient,
        private callbacks: CommandLineCallbacks,
    ) {
        this.callbacks = callbacks;
        this.input = window.createQuickPick();
        (this.input as any).sortByLabel = false;
        this.input.ignoreFocusOut = true;
        this.disposables.push(
            this.input,
            this.input.onDidAccept(this.onAccept),
            this.input.onDidChangeValue(this.onChange),
            this.input.onDidHide(this.onHide),
            commands.registerCommand("vscode-neovim.commit-cmdline", this.onAccept),
            commands.registerCommand("vscode-neovim.send-cmdline", this.sendRedraw),
            commands.registerCommand("vscode-neovim.test-cmdline", this.testCmdline),
        );
    }

    public show(content = "", mode: string, prompt = ""): void {
        if (!this.isDisplayed) {
            this.input.value = "";
            this.input.items = [];
            this.input.activeItems = [];
            this.isDisplayed = true;
            this.input.title = prompt || this.getTitle(mode);
            this.input.show();
            // display content after cmdline appears - otherwise it will be preselected that is not good when calling from visual mode
            if (content) {
                this.input.value = content;
            }
        } else {
            const newTitle = prompt || this.getTitle(mode);
            if (newTitle !== this.input.title) {
                this.input.title = newTitle;
            }
            // only redraw if triggered from a known keybinding. Otherwise, delayed nvim cmdline_show could replace fast typing.
            if (this.redrawExpected && this.input.value !== content) {
                this.input.value = content;
                this.redrawExpected = false;
                this.updatedFromNvim = true;
            } else {
                logger.debug(`Ignoring cmdline_show because no redraw expected: ${content}`);
            }
        }
    }

    public setCompletionItems(items: [string, string, string, string][], selected: number): void {
        this.input.items = items.map((item) => ({ label: item[0], alwaysShow: true }));
        this.setSelection(selected);
    }

    public setSelection(selected: number): void {
        // TODO: fix jitter/hack
        this.input.activeItems = [this.input.items[selected]];
        setTimeout(() => (this.input.activeItems = [this.input.items[selected]]), 1);
    }

    public cancel(ignoreHideEvent = false): void {
        this.ignoreHideEvent = ignoreHideEvent;
        this.input.hide();
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }

    private onAccept = (): void => {
        if (!this.isDisplayed) {
            return;
        }
        this.callbacks.onChanged(this.input.value);
        this.callbacks.onAccepted();
    };

    private onChange = (e: string): void => {
        if (!this.isDisplayed) {
            return;
        }
        if (this.updatedFromNvim) {
            this.updatedFromNvim = false;
            logger.debug(`Skipped updating cmdline because change originates from nvim: ${e}`);
        } else {
            logger.debug(`Sending cmdline to nvim: ${e}`);
            this.callbacks.onChanged(e);
        }
    };

    private onHide = (): void => {
        if (!this.isDisplayed) {
            return;
        }
        this.clean();
        if (this.ignoreHideEvent) {
            this.ignoreHideEvent = false;
            return;
        }
        this.callbacks.onCanceled();
    };

    private getTitle(modeOrPrompt: string): string {
        switch (modeOrPrompt) {
            case "/":
                return `${GlyphChars.SEARCH_FORWARD} Forward Search:`;
            case "?":
                return `${GlyphChars.SEARCH_BACKWARD} Backward Search:`;
            case ":":
                return `${GlyphChars.COMMAND} VIM Command Line:`;
            default:
                return modeOrPrompt;
        }
    }

    private clean(): void {
        this.isDisplayed = false;
        this.input.value = "";
        this.input.title = "";
        this.input.items = [];
        this.input.activeItems = [];
    }

    // use this function for keybindings in command line that cause content to update
    private sendRedraw = (keys: string): void => {
        this.redrawExpected = true;
        this.client.input(keys);
    };

    private testCmdline = (e: string): void => {
        this.input.value += e;
    };
}
