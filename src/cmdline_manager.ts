import { Disposable, commands } from "vscode";

import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";
import { createLogger } from "./logger";
import { GlyphChars } from "./constants";
import { CmdlineInput } from "./cmdline/cmdline_input";

const logger = createLogger("CmdLine", false);

export class CommandLineManager implements Disposable {
    private disposables: Disposable[] = [];

    // Our current instance of the command line input. This should be destroyed every time we hide it
    private _currentInput?: CmdlineInput;

    // When we type, we send updates to nvim. We want to ignore updates coming from nvim, because it may interfere with typing.
    // However, bindings are expected to cause the cmdline content to change, so we use this flag to listen to those updates.
    private redrawExpected = true;

    // On cmdline_hide, we close the input. This flag is used to ignore that event so we don't send an <Esc> to nvim.
    private ignoreHideEvent = false;

    public constructor(private main: MainController) {
        eventBus.on("redraw", (eventData) => this.handleRedraw(eventData), this, this.disposables);
        this.disposables.push(
            this.registerCommandHandler("vscode-neovim.commit-cmdline", () => this.onAccept()),
            commands.registerCommand("vscode-neovim.send-cmdline", (text) => this.sendRedraw(text)),
            commands.registerCommand("vscode-neovim.test-cmdline", (text) => this.testCmdline(text)),
        );
    }

    public dispose() {
        this._currentInput?.dispose();
        disposeAll(this.disposables);
    }

    private registerCommandHandler(cmd: string, handler: (...args: any[]) => Promise<void>): Disposable {
        return commands.registerCommand(cmd, (...args) => {
            handler(...args).catch((err) => {
                logger.error(`Failed to handle command '${cmd}': ${err}`);
            });
        });
    }

    private handleRedraw({ name, args }: EventBusData<"redraw">) {
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
                this.currentInput.setItems(items.map((item) => ({ label: item[0], alwaysShow: true })));
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
                this.currentInput.clearItems();
                break;
            }

            case "cmdline_hide": {
                logger.debug(`cmdline_hide`);
                this.cmdlineHide();
                break;
            }
        }
    }

    private get currentInput(): CmdlineInput {
        if (this._currentInput != null) {
            return this._currentInput;
        }

        this._currentInput = new CmdlineInput({
            onAccept: () => {
                this.onAccept().catch((err) => {
                    logger.error(`Failed to accept cmdline input: ${err}`);
                });
            },
            onHide: () => {
                this.onHide().catch((err) => {
                    logger.error(`Failed to hide cmdline input: ${err}`);
                });
            },
            onChangeSelection: (selectionIndex) => {
                this.onSelection(selectionIndex).catch((err) => {
                    logger.error(`Failed to propagate cmdline selection: ${err}`);
                });
            },
            onChangeValue: (value, toInput) => {
                this.onChange(value, toInput).catch((err) => {
                    logger.error(`Failed to propagate cmdline text change: ${err}`);
                });
            },
        });

        return this._currentInput;
    }

    private cmdlineShow = (content: string, firstc: string, prompt: string, level: number): void => {
        // only redraw if triggered from a known keybinding. Otherwise, delayed nvim cmdline_show could replace fast typing.
        if (!this.redrawExpected) {
            logger.debug(`cmdline_show: ignoring cmdline_show because no redraw expected: "${content}"`);
            return;
        }

        this.redrawExpected = false;

        const title = prompt || this.getTitle(firstc);
        const valueChanged = this.currentInput.show(level, title, content);
        if (valueChanged) {
            logger.debug(`cmdline_show: setting input value: "${content}", with level ${level}`);
            this.currentInput.addIgnoredUpdate();
        } else {
            logger.debug("dropping cmdline_show as the content is unchanged");
        }
    };

    private cmdlineHide() {
        // We expect that a cmdline_show may come through to draw this editor a second time (e.g. when level changes)
        this.redrawExpected = true;

        // cmdline levels start at one, so only hide this if we're at level 1
        // (or, defensively, if we already should be hidden)
        const level = this.currentInput.getLevel();
        if (level === 1 || level === undefined) {
            logger.debug(`visible level is ${level == null ? "none" : level}, hiding`);
            // The hide originated from neovim, so we don't need to listen for the hide event from the quickpick
            this.ignoreHideEvent = true;

            this.hideInput();
        } else {
            logger.debug(`visible level is ${level}, not hiding`);
            // We will eventually be sent a cmdline_show with the new level, so no need to manually
            // manipulate it
        }
    }

    private setSelection(index: number): void {
        this.currentInput.setSelection(index);
    }

    private async onAccept(): Promise<void> {
        logger.debug("onAccept, entering <CR>");
        await this.main.client.input("<CR>");
    }

    private async onChange(_text: string, toType: string): Promise<void> {
        await this.main.client.input(toType);
    }

    private async onHide(): Promise<void> {
        if (this.ignoreHideEvent) {
            logger.debug("onHide: skipping event");
            this.ignoreHideEvent = false;
            return;
        }

        logger.debug("onHide: entering <ESC>");
        await this.main.client.input("<Esc>");
    }

    private async onSelection(selectionIndex: number): Promise<void> {
        this.redrawExpected = true;
        await this.main.client.request("nvim_select_popupmenu_item", [selectionIndex, false, false, {}]);
    }

    // use this function for keybindings in command line that cause content to update
    private sendRedraw(keys: string) {
        logger.debug(`sendRedraw: "${keys}"`);
        this.redrawExpected = true;
        this.main.client.input(keys);
    }

    private testCmdline(e: string): void {
        this.currentInput.testCmdlineInput(e);
    }

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

    private hideInput() {
        this._currentInput?.dispose();
        this._currentInput = undefined;
    }
}
