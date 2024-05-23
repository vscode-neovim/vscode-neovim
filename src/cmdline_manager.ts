import { Disposable, QuickPick, QuickPickItem, commands, window } from "vscode";

import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";
import { createLogger } from "./logger";
import { calculateInputAfterTextChange } from "./cmdline/cmdline_text";
import { GlyphChars } from "./constants";

const logger = createLogger("CmdLine");

export class CommandLineManager implements Disposable {
    private disposables: Disposable[] = [];

    // The quickpick used to render the command line
    private input: QuickPick<QuickPickItem>;

    // The last text typed in the UI, used to calculate changes
    private lastTypedText: string = "";

    // On cmdline_hide, we close the quickpick. This flag is used to ignore that event so we don't send an <Esc> to nvim.
    private ignoreHideEvent = false;

    // When we type, we send updates to nvim. We want to ignore updates coming from nvim, because it may interfere with typing.
    // However, bindings are expected to cause the cmdline content to change, so we use this flag to listen to those updates.
    private redrawExpected = true;

    public constructor(private main: MainController) {
        eventBus.on("redraw", this.handleRedraw, this, this.disposables);
        this.input = window.createQuickPick();
        (this.input as any).sortByLabel = false;
        this.input.ignoreFocusOut = true;
        this.reset();
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

    public dispose() {
        disposeAll(this.disposables);
    }

    private reset() {
        this.lastTypedText = "";
        this.ignoreHideEvent = false;
        this.redrawExpected = true;
        this.input.value = "";
        this.input.title = "";
        this.input.items = [];
        this.input.activeItems = [];
    }

    private handleRedraw({ name, args }: EventBusData<"redraw">) {
        switch (name) {
            case "cmdline_show": {
                const [content, _pos, firstc, prompt, _indent, _level] = args[0];
                const allContent = content.map(([, str]) => str).join("");
                this.lastTypedText = allContent;
                this.input.title = prompt || this.getTitle(firstc);
                this.input.show();
                // only redraw if triggered from a known keybinding. Otherwise, delayed nvim cmdline_show could replace fast typing.
                if (this.redrawExpected && this.input.value !== allContent) {
                    this.input.value = allContent;
                    this.redrawExpected = false;
                } else {
                    logger.debug(`Ignoring cmdline_show because no redraw expected: ${content}`);
                }
                break;
            }
            case "popupmenu_show": {
                const [items, selected, _row, _col, _grid] = args[0];
                this.input.items = items.map((item) => ({ label: item[0], alwaysShow: true }));
                this.setSelection(selected);
                break;
            }
            case "popupmenu_select": {
                this.setSelection(args[0][0]);
                break;
            }
            case "popupmenu_hide": {
                this.input.items = [];
                break;
            }
            case "cmdline_hide": {
                this.ignoreHideEvent = true;
                this.input.hide();
                break;
            }
        }
    }

    public setSelection(selected: number): void {
        // TODO: fix jitter/hack
        this.input.activeItems = [this.input.items[selected]];
        setTimeout(() => (this.input.activeItems = [this.input.items[selected]]), 1);
    }

    private onAccept = async (): Promise<void> => {
        await this.main.client.input("<CR>");
    };

    private onChange = async (text: string): Promise<void> => {
        logger.debug(`Sending cmdline to nvim: ${text}`);
        const toType = calculateInputAfterTextChange(this.lastTypedText, text);
        this.lastTypedText = text;
        await this.main.client.input(toType);
    };

    private onHide = async (): Promise<void> => {
        this.reset();
        if (!this.ignoreHideEvent) {
            await this.main.client.input("<Esc>");
        }
        this.ignoreHideEvent = false;
    };

    // use this function for keybindings in command line that cause content to update
    private sendRedraw = (keys: string): void => {
        this.redrawExpected = true;
        this.main.client.input(keys);
    };

    private testCmdline = (e: string): void => {
        this.input.value += e;
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
}
