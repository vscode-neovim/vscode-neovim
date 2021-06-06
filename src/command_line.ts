import { Disposable, window, QuickPick, QuickPickItem, commands } from "vscode";
import { NeovimClient } from "neovim";

import { GlyphChars } from "./constants";

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

    private neovimClient: NeovimClient;

    private ignoreHideEvent = false;

    private callbacks: CommandLineCallbacks;

    public constructor(client: NeovimClient, callbacks: CommandLineCallbacks) {
        this.neovimClient = client;
        this.callbacks = callbacks;
        this.input = window.createQuickPick();
        this.input.ignoreFocusOut = true;
        this.disposables.push(this.input.onDidAccept(this.onAccept));
        this.disposables.push(this.input.onDidChangeValue(this.onChange));
        this.disposables.push(this.input.onDidHide(this.onHide));
        this.disposables.push(commands.registerCommand("vscode-neovim.commit-cmdline", this.onAccept));
        this.disposables.push(commands.registerCommand("vscode-neovim.delete-word-left-cmdline", this.deleteWord));
        this.disposables.push(commands.registerCommand("vscode-neovim.delete-all-cmdline", this.deleteAll));
        this.disposables.push(commands.registerCommand("vscode-neovim.delete-char-left-cmdline", this.deleteChar));
        this.disposables.push(commands.registerCommand("vscode-neovim.history-up-cmdline", this.onHistoryUp));
        this.disposables.push(commands.registerCommand("vscode-neovim.history-down-cmdline", this.onHistoryDown));
        this.disposables.push(
            commands.registerCommand("vscode-neovim.complete-selection-cmdline", this.acceptSelection),
        );
        this.disposables.push(
            commands.registerCommand("vscode-neovim.paste-register-cmdline", (reg) => this.pasteFromRegister(reg)),
        );
    }

    public show(initialContent = "", mode: string, prompt = ""): void {
        if (!this.isDisplayed) {
            this.input.value = "";
            this.isDisplayed = true;
            this.input.value = "";
            this.mode = mode;
            this.input.title = prompt || this.getTitle(mode);
            this.input.show();
            // display content after cmdline appears - otherwise it will be preselected that is not good when calling from visual mode
            if (initialContent) {
                this.input.value = initialContent;
            }
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
        this.completionItems = items.map((i) => ({ label: i, alwaysShow: true }));
        if (this.completionAllowed) {
            this.input.items = this.completionItems;
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
        this.callbacks.onChanged(e, useCompletion);
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

        this.input.value = this.input.value.trimRight().split(" ").slice(0, -1).join(" ");
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
        this.input.value = this.input.value.split(" ").slice(0, -1).concat(sel.label).join(" ");
        this.onChange(this.input.value);
    };

    private onHistoryUp = async (): Promise<void> => {
        await this.neovimClient.input("<Up>");
        const res = await this.neovimClient.callFunction("getcmdline", []);
        if (res) {
            this.input.value = res;
            this.input.show();
        }
    };

    private onHistoryDown = async (): Promise<void> => {
        await this.neovimClient.input("<Down>");
        const res = await this.neovimClient.callFunction("getcmdline", []);
        if (res) {
            this.input.value = res;
            this.input.show();
        }
    };

    private pasteFromRegister = async (registerName: string): Promise<void> => {
        if (!this.isDisplayed) {
            return;
        }
        const content = await this.neovimClient.callFunction("VSCodeGetRegister", [registerName]);
        if (content === "") {
            return;
        }
        this.input.value = this.input.value.concat(content);
        this.onChange(this.input.value);
    };
}
