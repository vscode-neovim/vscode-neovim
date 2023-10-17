import { NeovimClient } from "neovim";
import { Disposable, QuickPick, QuickPickItem, commands, window } from "vscode";

import { GlyphChars } from "./constants";
import { createLogger } from "./logger";

const logger = createLogger("CmdLine");

export interface CommandLineCallbacks {
    onAccepted(): void;
    onChanged(str: string, complete: boolean): void;
    onCanceled(): void;
}

export class CommandLineController implements Disposable {
    public isDisplayed = false;

    private input: QuickPick<QuickPickItem>;

    private disposables: Disposable[] = [];

    private completionAllowed = false;

    private completionTimer?: NodeJS.Timeout;

    private completionItems: QuickPickItem[] = [];

    private mode = "";

    private ignoreHideEvent = false;

    private redrawExpected = false; // whether to accept incoming cmdline_show

    private updatedFromNvim = false; // whether to replace nvim cmdline with new content

    private wildMenuVisible = false; // indicates if the wildmenu is visible

    public constructor(
        private client: NeovimClient,
        private callbacks: CommandLineCallbacks,
        private completionDelay: number,
    ) {
        this.callbacks = callbacks;
        this.input = window.createQuickPick();
        this.input.ignoreFocusOut = true;
        this.disposables.push(
            this.input.onDidAccept(this.onAccept),
            this.input.onDidChangeValue(this.onChange),
            this.input.onDidHide(this.onHide),
            commands.registerCommand("vscode-neovim.commit-cmdline", this.onAccept),
            commands.registerCommand("vscode-neovim.complete-selection-cmdline", this.acceptSelection),
            commands.registerCommand("vscode-neovim.send-cmdline", this.sendRedraw),
            commands.registerCommand("vscode-neovim.test-cmdline", this.testCmdline),
        );
    }

    public show(content = "", mode: string, prompt = ""): void {
        if (!this.isDisplayed) {
            this.input.value = "";
            this.isDisplayed = true;
            this.mode = mode;
            this.input.title = prompt || this.getTitle(mode);
            this.input.show();
            // display content after cmdline appears - otherwise it will be preselected that is not good when calling from visual mode
            if (content) {
                this.input.value = content;
            }
            // Display completions only after a configurable amount of time (1.5s default), so it won't bother for simple things like ":w" or ":noh"
            this.completionAllowed = false;
            this.completionItems = [];
            this.input.items = [];

            if (this.completionDelay === 0) {
                this.processCompletionTimer();
            } else {
                this.completionTimer = setTimeout(this.processCompletionTimer, this.completionDelay);
            }
        } else {
            const newTitle = prompt || this.getTitle(mode);
            if (newTitle !== this.input.title) {
                this.input.title = newTitle;
            }
            // only redraw if triggered from a known keybinding. Otherwise, delayed nvim
            // cmdline_show could replace fast typing. Also ignores completion artifacts.
            if (this.redrawExpected && this.input.value !== content) {
                this.input.value = content;
                this.redrawExpected = false;
                this.updatedFromNvim = true;
            } else {
                logger.debug(`Ignoring cmdline_show because no redraw expected: ${content}`);
            }
        }
    }

    public setCompletionItems(items: string[]): void {
        this.completionItems = items.map((i) => ({ label: i, alwaysShow: true }));
        if (this.completionAllowed) {
            this.input.items = this.completionItems;
            // When deleting the input text to empty, the wildmenu displays all the candidate commands.
            // However, the wildmenu is not actually useful in this situation, so it is forced to be invisible.
            // This allows Ctrl+n and Ctrl+p to input normally(navigating history) instead of selecting candidates in quickOpen.
            const wildMenuVisible = this.input.value.length > 0 && this.completionItems.length > 0;
            if (this.wildMenuVisible !== wildMenuVisible) {
                this.wildMenuVisible = wildMenuVisible;
                commands.executeCommand("setContext", "neovim.wildMenuVisible", this.wildMenuVisible);
            }
        }
    }

    public cancel(ignoreHideEvent = false): void {
        this.ignoreHideEvent = ignoreHideEvent;
        this.input.hide();
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.input.dispose();
    }

    private onAccept = (): void => {
        if (!this.isDisplayed) {
            return;
        }
        this.callbacks.onChanged(this.input.value, false);
        this.callbacks.onAccepted();
    };

    private onChange = (e: string): void => {
        if (!this.isDisplayed) {
            return;
        }
        const mode = this.mode;
        if (mode === ":" && (e.charAt(0) === "?" || e.charAt(0) === "/") && this.input.items.length) {
            this.input.items = [];
            this.completionItems = [];
        }
        const useCompletion =
            mode === ":" &&
            e.charAt(0) !== "?" &&
            e.charAt(0) !== "/" &&
            !e.includes("s/") &&
            !e.includes("substitute/") &&
            !e.includes("g/") &&
            !e.includes("global/") &&
            !e.includes("v/") &&
            !e.includes("vglobal/");
        if (!useCompletion) {
            this.cancelCompletions();
        }
        if (this.updatedFromNvim) {
            this.updatedFromNvim = false;
            logger.debug(`Skipped updating cmdline because change originates from nvim: ${e}`);
        } else {
            logger.debug(`Sending cmdline to nvim: ${e}`);
            this.callbacks.onChanged(e, useCompletion);
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

    private processCompletionTimer = (): void => {
        this.completionAllowed = true;
        if (this.isDisplayed && this.completionItems.length) {
            this.input.items = this.completionItems;
        }
        this.completionTimer = undefined;
    };

    private cancelCompletions = (): void => {
        if (this.completionTimer) {
            clearTimeout(this.completionTimer);
            this.completionTimer = undefined;
        }
        this.input.items = [];
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
        if (this.completionTimer) {
            clearTimeout(this.completionTimer);
        }
        this.isDisplayed = false;
        this.input.value = "";
        this.input.title = "";
        this.mode = "";
        this.completionAllowed = false;
        this.input.items = [];
        this.completionItems = [];
    }

    private acceptSelection = (): void => {
        if (!this.isDisplayed) {
            return;
        }
        const sel = this.input.activeItems[0];
        if (!sel) {
            return;
        }
        const selected = sel.label;
        let lastInputEl = this.input.value;
        // if there is more than one command, get the last one (command, path or space delimited)
        const symbolCheck = /[\s/\\!@#$:<'>%]/g;
        if (symbolCheck.test(lastInputEl)) {
            lastInputEl = lastInputEl.split(symbolCheck).pop()!;
        }
        const isSubstring = selected.search(lastInputEl);
        if ((lastInputEl && isSubstring !== -1) || lastInputEl === "~") {
            this.input.value = this.input.value.replace(lastInputEl, selected);
        } else {
            this.input.value += selected;
        }
        this.onChange(this.input.value);
    };

    // use this function for keybindings in command line that cause content to update
    private sendRedraw = (keys: string): void => {
        this.redrawExpected = true;
        this.client.input(keys);
    };

    private testCmdline = (e: string): void => {
        this.input.value += e;
    };
}
