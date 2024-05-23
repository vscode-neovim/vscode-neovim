import { NeovimClient } from "neovim";
import { Disposable, QuickPick, QuickPickItem, commands, window } from "vscode";

import { GlyphChars } from "../constants";
import { createLogger } from "../logger";
import { disposeAll } from "../utils";

import { calculateInputAfterTextChange } from "./cmdline_text";

const logger = createLogger("CmdLine");

export class CommandLineController implements Disposable {
    private input: QuickPick<QuickPickItem>;

    private disposables: Disposable[] = [];

    /**
     * The last text typed in the UI, used to calculate changes
     */
    private lastTypedText: string = "";

    private ignoreHideEvent = false;

    private redrawExpected = true; // whether to accept incoming cmdline_show

    private updatedFromNvim = false; // whether to replace nvim cmdline with new content

    public constructor(private client: NeovimClient) {
        this.input = window.createQuickPick();
        (this.input as any).sortByLabel = false;
        this.input.ignoreFocusOut = true;
        this.input.value = "";
        this.input.items = [];
        this.input.activeItems = [];
        this.input.show();
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

    public show(content: string, mode: string, prompt = ""): void {
        this.lastTypedText = content;
        this.input.title = prompt || this.getTitle(mode);
        // only redraw if triggered from a known keybinding. Otherwise, delayed nvim cmdline_show could replace fast typing.
        if (this.redrawExpected && this.input.value !== content) {
            this.input.value = content;
            this.redrawExpected = false;
            this.updatedFromNvim = true;
        } else {
            logger.debug(`Ignoring cmdline_show because no redraw expected: ${content}`);
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

    private onAccept = async (): Promise<void> => {
        await this.client.input("<CR>");
    };

    private onChange = async (text: string): Promise<void> => {
        if (this.updatedFromNvim) {
            this.updatedFromNvim = false;
            logger.debug(`Skipped updating cmdline because change originates from nvim: ${text}`);
        } else {
            logger.debug(`Sending cmdline to nvim: ${text}`);
            const toType = calculateInputAfterTextChange(this.lastTypedText, text);
            this.lastTypedText = text;
            await this.client.input(toType);
        }
    };

    private onHide = async (): Promise<void> => {
        this.clean();
        if (this.ignoreHideEvent) {
            this.ignoreHideEvent = false;
            return;
        }
        await this.client.input("<Esc>");
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
