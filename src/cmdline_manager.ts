import { Disposable, QuickInputButton, QuickPick, QuickPickItem, ThemeIcon, commands, window } from "vscode";

import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";
import { createLogger } from "./logger";
import { calculateInputAfterTextChange } from "./cmdline/cmdline_text";
import { GlyphChars } from "./constants";

const logger = createLogger("CmdLine", false);

export class CommandLineManager implements Disposable {
    private disposables: Disposable[] = [];

    // The quickpick used to render the command line
    private input: QuickPick<QuickPickItem>;

    // The last text typed in the UI, used to calculate changes
    private lastTypedText: string = "";

    // On suggestion selection, we don't want to send <CR> to nvim, so we ignore the accept event.
    private ignoreAcceptEvent = false;
    // On cmdline_hide, we close the quickpick. This flag is used to ignore that event so we don't send an <Esc> to nvim.
    private ignoreHideEvent = false;

    // When we type, we send updates to nvim. We want to ignore updates coming from nvim, because it may interfere with typing.
    // However, bindings are expected to cause the cmdline content to change, so we use this flag to listen to those updates.
    private redrawExpected = true;

    // When updates come from nvim, we write to the input field.
    // We don't want to send those updates back to nvim, so we use this counter to keep track of the number of onChange to ignore.
    private pendingNvimUpdates = 0;

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
        this.reset();
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
        this.lastTypedText = "";
        this.ignoreAcceptEvent = false;
        this.ignoreHideEvent = false;
        this.redrawExpected = true;
        this.pendingNvimUpdates = 0;
        this.input.value = "";
        this.input.title = "";
        this.input.items = [];
        this.input.activeItems = [];
    }

    private handleRedraw({ name, args }: EventBusData<"redraw">) {
        switch (name) {
            case "cmdline_show": {
                const [icontent, _pos, firstc, prompt, _indent, _level] = args[0];
                const content = icontent.map(([, str]) => str).join("");
                logger.debug(`cmdline_show: "${content}"`);
                this.lastTypedText = content;
                this.input.title = prompt || this.getTitle(firstc);
                // only redraw if triggered from a known keybinding. Otherwise, delayed nvim cmdline_show could replace fast typing.
                if (!this.redrawExpected) {
                    logger.debug(`cmdline_show: ignoring cmdline_show because no redraw expected: "${content}"`);
                    break;
                }
                this.redrawExpected = false;
                this.input.show();
                if (this.input.value !== content) {
                    this.pendingNvimUpdates++;
                    const activeItems = this.input.activeItems; // backup selections
                    this.input.value = content; // update content
                    this.input.activeItems = activeItems; // restore selections
                }
                break;
            }
            case "popupmenu_show": {
                const [items, selected, _row, _col, _grid] = args[0];
                logger.debug(
                    `popupmenu_show: "${items.length}[${selected}]: ${selected === -1 ? "unselected" : items[selected]}"`,
                );
                this.input.items = items.map((item) => ({ label: item[0], alwaysShow: true }));
                this.input.activeItems = [this.input.items[selected]];
                break;
            }
            case "popupmenu_select": {
                const [selected] = args[0];
                logger.debug(`popupmenu_select: "${selected}"`);
                this.input.activeItems = [this.input.items[selected]];
                break;
            }
            case "popupmenu_hide": {
                logger.debug(`popupmenu_hide`);
                this.input.items = [];
                break;
            }
            case "cmdline_hide": {
                logger.debug(`cmdline_hide`);
                this.ignoreHideEvent = true;
                this.input.hide();
                break;
            }
        }
    }

    private onAccept = async (): Promise<void> => {
        if (!this.ignoreAcceptEvent) {
            await this.main.client.input("<CR>");
        }
        this.ignoreAcceptEvent = false;
    };

    private onChange = async (text: string): Promise<void> => {
        if (this.pendingNvimUpdates) {
            this.pendingNvimUpdates--;
            logger.debug(
                `onChange: skip updating cmdline because change originates from nvim: "${this.lastTypedText}"`,
            );
            return;
        }
        const toType = calculateInputAfterTextChange(this.lastTypedText, text);
        logger.debug(`onChange: sending cmdline to nvim: "${this.lastTypedText}" + "${toType}" -> "${text}"`);
        await this.main.client.input(toType);
        this.lastTypedText = text;
    };

    private onHide = async (): Promise<void> => {
        this.reset();
        if (!this.ignoreHideEvent) {
            await this.main.client.input("<Esc>");
        }
        this.ignoreHideEvent = false;
    };

    private onSelection = (e: readonly QuickPickItem[]): void => {
        if (e.length === 0) {
            return;
        }
        logger.debug(`onSelection: "${e[0].label}"`);
        this.ignoreAcceptEvent = true;
        this.redrawExpected = true;
        this.input.value = e[0].label;
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
