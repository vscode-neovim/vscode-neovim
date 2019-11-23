import { Disposable, window, QuickPick, QuickPickItem, commands } from "vscode";

import { GlyphChars } from "./constants";

export class CommandLineController implements Disposable {
    public isDisplayed = false;

    private input: QuickPick<QuickPickItem>;

    private disposables: Disposable[] = [];

    private completionAllowed = false;

    private completionTimer?: NodeJS.Timeout;

    private completionItems: QuickPickItem[] = [];

    private mode = "";

    public constructor() {
        this.input = window.createQuickPick();
        this.input.ignoreFocusOut = true;
        this.disposables.push(this.input.onDidAccept(this.onAccept));
        this.disposables.push(this.input.onDidChangeValue(this.onChange));
        this.disposables.push(this.input.onDidHide(this.onHide));
        this.disposables.push(commands.registerCommand("vscode-neovim.delete-word-left-cmdline", this.deleteWord));
        this.disposables.push(commands.registerCommand("vscode-neovim.delete-all-cmdline", this.deleteAll));
        this.disposables.push(commands.registerCommand("vscode-neovim.delete-char-left-cmdline", this.deleteChar));
        this.disposables.push(
            commands.registerCommand("vscode-neovim.complete-selection-cmdline", this.acceptSelection),
        );
    }

    public show(initialContent = "", mode: string, prompt = ""): void {
        if (!this.isDisplayed) {
            this.input.value = "";
            this.isDisplayed = true;
            this.input.value = initialContent;
            this.mode = mode;
            this.input.title = prompt || this.getTitle(mode);
            this.input.show();
            // Display completions only after 1.5secons, so it won't bother for simple things like ":w" or ":noh"
            this.completionAllowed = false;
            this.completionItems = [];
            this.input.items = [];
            this.completionTimer = setTimeout(this.processCompletionTimer, 1500);
            // breaks mappings with command line mode, e.g. :call stuff()
            // this.onChange(this.input.value);
        } else {
            const newTitle = prompt || this.getTitle(mode);
            if (newTitle !== this.input.title) {
                this.input.title = newTitle;
            }
            // we want take content for the search modes, because <c-l>/<c-w><c-r> keybindings
            if (this.mode === "/" || this.mode === "?") {
                this.input.value = initialContent;
            }
        }
    }

    public setCompletionItems(items: string[]): void {
        this.completionItems = items.map(i => ({ label: i, alwaysShow: true }));
        if (this.completionAllowed) {
            this.input.items = this.completionItems;
        }
    }

    public cancel(): void {
        this.input.hide();
    }

    public onAccepted?: () => void;
    public onChanged?: (str: string, complete: boolean) => void;
    public onCanceled?: () => void;

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
        if (this.onAccepted) {
            this.onAccepted();
        }
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
        if (!this.onChanged) {
            return;
        }
        this.onChanged(e, mode !== "/" && mode !== "?" && e.charAt(0) !== "/" && e.charAt(0) !== "?");
    };

    private onHide = (): void => {
        if (!this.isDisplayed) {
            return;
        }
        this.clean();
        if (!this.onCanceled) {
            return;
        }
        this.onCanceled();
    };

    private processCompletionTimer = (): void => {
        this.completionAllowed = true;
        if (this.isDisplayed && this.completionItems.length) {
            this.input.items = this.completionItems;
        }
        this.completionTimer = undefined;
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

    private deleteAll = (): void => {
        if (!this.isDisplayed) {
            return;
        }
        this.input.value = "";
        this.onChange("");
    };

    private deleteChar = (): void => {
        if (!this.isDisplayed) {
            return;
        }
        this.input.value = this.input.value.slice(0, -1);
        this.onChange(this.input.value);
    };

    private deleteWord = (): void => {
        if (!this.isDisplayed) {
            return;
        }

        this.input.value = this.input.value
            .trimRight()
            .split(" ")
            .slice(0, -1)
            .join(" ");
        this.onChange(this.input.value);
    };

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
        this.input.value = this.input.value
            .split(" ")
            .slice(0, -1)
            .concat(sel.label)
            .join(" ");
        this.onChange(this.input.value);
    };
}
