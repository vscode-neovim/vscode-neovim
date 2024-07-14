import { Disposable, QuickInputButton, QuickPick, QuickPickItem, ThemeIcon, commands, window } from "vscode";

import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";
import { createLogger } from "./logger";
import { calculateInputAfterTextChange } from "./cmdline/cmdline_text";
import { GlyphChars } from "./constants";
import { CmdlineQueue } from "./cmdline/cmdline_queue";

const logger = createLogger("CmdLine", false);

class CmdlineState {
    // The last text typed in the UI, used to calculate changes
    lastTypedText: string = "";

    // The current "level" of the cmdline we show. :help ui describes this as
    //  > The Nvim command line can be invoked recursively, for instance by typing <c-r>= at the command line prompt.
    //  > The level field is used to distinguish different command lines active at the same time. The first invoked
    //  > command line has level 1, the next recursively-invoked prompt has level 2. A command line invoked from the
    //  > cmdline-window has a higher level than the edited command line.
    //
    // If this value is undefined, the input is not visible
    level?: number = undefined;

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
    // A queue of incoming events. See docblock for more details, but this is used to resolve an inherent
    // race condition in the way we handle events.
    private queue = new CmdlineQueue();

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

    private handleRedraw(event: EventBusData<"redraw">) {
        const allowedEvents = ["cmdline_show", "cmdline_hide", "popupmenu_show", "popupmenu_select", "popupmenu_hide"];
        if (allowedEvents.indexOf(event.name) === -1) {
            // Drop any events not relevant to the cmdline; there is no sense in wasting memory queuing them up
            // if they'll just be dropped anyway.
            return;
        }

        const handle = this.queue.handleNvimRedrawEvent(event);
        if (handle) {
            this.handleRedrawEvent(event);
        }
    }

    private handleRedrawEvent({ name, args }: EventBusData<"redraw">) {
        switch (name) {
            case "cmdline_show": {
                const [content, _pos, firstc, prompt, _indent, level] = args[0];
                const allContent = content.map(([, str]) => str).join("");
                logger.debug(`cmdline_show: "${content}"`);
                this.cmdlineShow(allContent, firstc, prompt, level);
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
                this.cmdlineHide();
                break;
            }
        }
    }

    private cmdlineShow = (content: string, firstc: string, prompt: string, level: number): void => {
        if (!this.isVisible()) {
            // Reset the state if this is a new dialog
            this.reset();
        }

        this.state.level = level;
        this.input.title = prompt || this.getTitle(firstc);
        // only redraw if triggered from a known keybinding. Otherwise, delayed nvim cmdline_show could replace fast typing.
        if (!this.state.redrawExpected) {
            logger.debug(`cmdline_show: ignoring cmdline_show because no redraw expected: "${content}"`);
            return;
        }
        this.state.redrawExpected = false;
        this.showInput();
        if (this.input.value !== content) {
            logger.debug(`cmdline_show: setting input value: "${content}"`);
            this.state.lastTypedText = content;
            this.state.pendingNvimUpdates++;
            const activeItems = this.input.activeItems; // backup selections
            this.input.value = content; // update content
            this.input.activeItems = activeItems; // restore selections
        }
    };

    private cmdlineHide() {
        // The hide originated from neovim, so we don't need to listen for the hide event from the quickpick
        this.state.ignoreHideEvent = true;
        // We expect that a cmdline_show may come through to draw this editor a second time (e.g. when level changes)
        this.state.redrawExpected = true;

        // cmdline levels start at one, so only hide this if we're at level 1
        // (or, defensively, if we already should be hidden)
        if (this.state.level === 1 || !this.isVisible()) {
            logger.debug(`visible level is ${this.state.level}, hiding`);
            this.hideInput();
        } else {
            logger.debug(`visible level is ${this.state.level}, not hiding`);
            // We will eventually be sent a cmdline_show with the new level, so no need to manually
            // manipulate it
        }
    }

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
        if (this.state.ignoreHideEvent) {
            logger.debug("onHide: skipping event");
            this.state.ignoreHideEvent = false;
        } else {
            logger.debug("onHide: entering <ESC>");
            await this.main.client.input("<Esc>");
        }

        const batch = this.queue.flushBatch();
        if (batch !== null) {
            logger.debug("onHide: flushing events");
            batch.forEach((event) => {
                // Process the events we we're waiting for
                this.handleRedrawEvent(event);
            });
        }
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

    private showInput() {
        this.input.show();
    }

    private hideInput() {
        this.state.level = undefined;
        this.input.hide();
    }

    private isVisible(): boolean {
        return this.state.level !== undefined;
    }
}
