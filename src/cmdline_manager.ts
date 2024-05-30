import { Disposable, QuickInputButton, QuickPick, QuickPickItem, ThemeIcon, commands, window } from "vscode";

import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";
import { createLogger } from "./logger";
import { calculateInputAfterTextChange } from "./utils/cmdline_text";
import { GlyphChars } from "./constants";

const logger = createLogger("CmdLine", false);

class CmdlineState {
    // whether the cmdline is currently visible
    isDisplayed = false;

    // The last text typed in the UI, used to calculate changes
    lastTypedText: string = "";

    // On cmdline_hide, we close the quickpick. This flag is used to ignore that event so we don't send an <Esc> to nvim.
    ignoreHideEvent = false;

    // When we type, we send updates to nvim. We want to ignore updates coming from nvim, because it may interfere with typing.
    // However, bindings are expected to cause the cmdline content to change, so we use this flag to listen to those updates.
    redrawExpected = true;

    // When updates come from nvim, we write to the input field.
    // We don't want to send those updates back to nvim, so we use this counter to keep track of the number of onChange to ignore.
    pendingNvimUpdates = 0;
}

export class CommandLineManager implements Disposable {
    private disposables: Disposable[] = [];

    private input: QuickPick<QuickPickItem>;
    private state = new CmdlineState();

    public constructor(private main: MainController) {
        eventBus.on("redraw", this.handleRedraw, this, this.disposables);
        this.input = window.createQuickPick();
        (this.input as any).sortByLabel = false;
        this.input.ignoreFocusOut = true;
        this.input.buttons = [
            {
                iconPath: new ThemeIcon("close"),
                tooltip: "Cancel",
            },
            {
                iconPath: new ThemeIcon("check"),
                tooltip: "Accept",
            },
        ];
        this.disposables.push(
            this.input,
            this.input.onDidAccept(this.onAccept),
            this.input.onDidChangeValue(this.onChange),
            this.input.onDidHide(this.onHide),
            this.input.onDidChangeSelection(this.onSelection),
            this.input.onDidTriggerButton(this.onButton),
            commands.registerCommand("vscode-neovim.commit-cmdline", this.onAccept),
            commands.registerCommand("vscode-neovim.send-cmdline", this.sendRedraw),
            commands.registerCommand("vscode-neovim.test-cmdline", this.testCmdline),
        );
    }

    public dispose() {
        disposeAll(this.disposables);
    }

    private reset() {
        this.state = new CmdlineState();
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
                logger.debug(`cmdline_show: "${content}"`);
                this.cmdlineShow(allContent, firstc, prompt);
                break;
            }
            case "popupmenu_show": {
                const [items, selected, _row, _col, _grid] = args[0];
                logger.debug(`popupmenu_show: ${items.length} items`);
                this.input.items = items.map((item) => ({ label: item[0], alwaysShow: true }));
                this.setSelection(selected);
                break;
            }
            case "popupmenu_select": {
                const [selected] = args[0];
                logger.debug(`popupmenu_select: "${selected}"`);
                this.setSelection(selected);
                break;
            }
            case "popupmenu_hide": {
                logger.debug(`popupmenu_hide`);
                this.input.items = [];
                break;
            }
            case "cmdline_hide": {
                logger.debug(`cmdline_hide`);
                if (this.state.isDisplayed) {
                    this.state.ignoreHideEvent = true;
                    this.input.hide();
                }
                this.state.isDisplayed = false;
                break;
            }
        }
    }

    private cmdlineShow = (content: string, firstc: string, prompt: string): void => {
        this.input.title = prompt || this.getTitle(firstc);
        // only redraw if triggered from a known keybinding. Otherwise, delayed nvim cmdline_show could replace fast typing.
        if (!this.state.redrawExpected) {
            logger.debug(`cmdline_show: ignoring cmdline_show because no redraw expected: "${content}"`);
            return;
        }
        this.input.show();
        this.state.isDisplayed = true;
        this.state.redrawExpected = false;
        if (this.input.value !== content) {
            logger.debug(`cmdline_show: setting input value: "${content}"`);
            this.state.pendingNvimUpdates++;
            this.state.lastTypedText = content;
            const activeItems = this.input.activeItems; // backup selections
            this.input.value = content; // update content
            this.input.activeItems = activeItems; // restore selections
        }
    };

    private setSelection = (index: number): void => {
        if (index === -1) {
            this.input.activeItems = [];
        } else {
            this.input.activeItems = [this.input.items[index]];
        }
    };

    private onAccept = async (): Promise<void> => {
        logger.debug("onAccept, entering <CR>");
        await this.main.client.input("<CR>");
    };

    private onChange = async (text: string): Promise<void> => {
        if (this.state.pendingNvimUpdates) {
            this.state.pendingNvimUpdates = Math.max(0, this.state.pendingNvimUpdates - 1);
            logger.debug(`onChange: skip updating cmdline because change originates from nvim: "${text}"`);
            return;
        }
        const toType = calculateInputAfterTextChange(this.state.lastTypedText, text);
        logger.debug(`onChange: sending cmdline to nvim: "${this.state.lastTypedText}" + "${toType}" -> "${text}"`);
        await this.main.client.input(toType);
        this.state.lastTypedText = text;
    };

    private onHide = async (): Promise<void> => {
        logger.debug("onHide, resetting cmdline");
        if (!this.state.ignoreHideEvent) {
            logger.debug("onHide, entering <ESC>");
            await this.main.client.input("<Esc>");
        }
        this.reset();
    };

    private onSelection = async (e: readonly QuickPickItem[]): Promise<void> => {
        if (e.length === 0) {
            return;
        }
        logger.debug(`onSelection: "${e[0].label}"`);
        this.state.redrawExpected = true;
        const index = this.input.items.indexOf(e[0]);
        await this.main.client.request("nvim_select_popupmenu_item", [index, false, false, {}]);
    };

    private onButton = async (button: QuickInputButton): Promise<void> => {
        if (button.tooltip === "Cancel") {
            this.input.hide();
        } else if (button.tooltip === "Accept") {
            await this.onAccept();
        }
    };

    // use this function for keybindings in command line that cause content to update
    private sendRedraw = (keys: string): void => {
        logger.debug(`sendRedraw: "${keys}"`);
        this.state.redrawExpected = true;
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
