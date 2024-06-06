import { QuickPick, QuickPickItem, ThemeIcon, window, Disposable, QuickInputButton } from "vscode";

import { disposeAll } from "../utils";
import { calculateInputAfterTextChange } from "../utils/cmdline_text";
import { createLogger } from "../logger";

const logger = createLogger("CmdLineInput", false);

export interface CmdlineInputListeners {
    onAccept: () => void;
    onChangeValue: (value: string, toInput: string) => void;
    onChangeSelection: (selectionIndex: number) => void;
    onHide: () => void;
}

/**
 * The input box used for the commandline input.
 */
export class CmdlineInput implements Disposable {
    private disposables: Disposable[] = [];

    private input: QuickPick<QuickPickItem>;

    // The last text typed in the UI, used to calculate changes
    private lastTypedText: string = "";

    // The current "level" of the cmdline we show. :help ui describes this as
    //  > The Nvim command line can be invoked recursively, for instance by typing <c-r>= at the command line prompt.
    //  > The level field is used to distinguish different command lines active at the same time. The first invoked
    //  > command line has level 1, the next recursively-invoked prompt has level 2. A command line invoked from the
    //  > cmdline-window has a higher level than the edited command line.
    //
    // If this value is undefined, the input is not visible
    private level?: number = undefined;

    // When updates come from nvim, we write to the input field.
    // We don't want to send those updates back to nvim, so we use this counter to keep track of the number of onChange to ignore.
    private pendingNvimUpdates = 0;

    private disposed: boolean = false;

    private listeners: CmdlineInputListeners;

    constructor(listeners: CmdlineInputListeners) {
        this.listeners = listeners;
        this.input = this.makeInput(listeners);
        this.disposables.push(this.input);
    }

    /**
     * Ensure the input box is showing.
     *
     * @param level The level of this input
     * @param title  The title to use for this input
     * @param initialValue The value that the input should have after this event.
     * @returns Whether or not the content of this input changed.
     */
    show(level: number, title: string, value: string): boolean {
        this.assertUndisposed();

        const oldValue = this.input.value;

        this.level = level;
        this.lastTypedText = value;

        // Must show before playing with the selection. This is definitely a VSCode bug
        this.input.show();

        const activeItems = this.input.activeItems; // backup selections
        this.input.title = title;
        this.input.value = value;

        this.input.activeItems = activeItems; // restore selections

        return oldValue !== value;
    }

    /**
     * Set the items in the suggestion list
     * @param items The items to show
     */
    setItems(items: readonly QuickPickItem[]): void {
        this.assertUndisposed();

        this.input.items = items;
    }

    /**
     * Clear all quickpick items
     */
    clearItems() {
        this.assertUndisposed();

        this.setItems([]);
    }

    /**
     * Set the index of the selection in the list of active items
     *
     * @param index The index to use
     */
    setSelection(index: number): void {
        this.assertUndisposed();

        if (index === -1) {
            this.input.activeItems = [];
        } else {
            this.input.activeItems = [this.input.items[index]];
        }
    }

    /**
     * @returns The current value in the input box
     */
    getValue(): string {
        this.assertUndisposed();

        return this.input.value;
    }

    /**
     * Only exposed for testing, to allow us to simulate VSCode on change events
     * @param s The input to add
     */
    testCmdlineInput(s: string): void {
        this.assertUndisposed();

        this.input.value += s;
    }

    /**
     * @returns The visibility level of this input. If undefined, the input is not shown.
     */
    getLevel(): number | undefined {
        this.assertUndisposed();

        return this.level;
    }

    /**
     * Add one to the count of updates to ignore. For every time this is called, one onChange will be ignored
     */
    addIgnoredUpdate() {
        this.assertUndisposed();
        this.pendingNvimUpdates++;
    }

    /**
     * Dispose this instance. The *ONLY* way to hide this input is to fully destroy it. Attempts to use this input after
     * it is disposed will throw an exception.
     */
    dispose() {
        this.disposed = true;
        this.input.hide();
        disposeAll(this.disposables);
    }

    private assertUndisposed() {
        if (this.disposed) {
            // This is always a bug. The instance should not be reused once it is disposed.
            throw new Error("Cannot use Commandline instance after it has been disposed");
        }
    }

    private makeInput(listeners: CmdlineInputListeners): QuickPick<QuickPickItem> {
        const input = window.createQuickPick();

        (input as any).sortByLabel = false;
        input.ignoreFocusOut = true;
        input.buttons = [
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
            input.onDidAccept(listeners.onAccept),
            input.onDidHide(listeners.onHide),
            input.onDidChangeValue((value) => this.onChange(value)),
            input.onDidChangeSelection((items) => this.onSelection(items)),
            input.onDidTriggerButton((button) => this.onButton(button)),
        );

        return input;
    }

    private onChange(value: string): void {
        if (this.pendingNvimUpdates) {
            this.pendingNvimUpdates = Math.max(0, this.pendingNvimUpdates - 1);
            logger.debug(`onChange: skip updating cmdline because change originates from nvim: "${value}"`);
            return;
        }

        const toType = calculateInputAfterTextChange(this.lastTypedText, value);
        logger.debug(`onChange: sending cmdline to nvim: "${this.lastTypedText}" + "${toType}" -> "${value}"`);
        this.lastTypedText = value;
        this.listeners.onChangeValue(value, toType);
    }

    private onSelection(items: readonly QuickPickItem[]): void {
        if (items.length === 0) {
            return;
        }

        logger.debug(`onSelection: "${items[0].label}"`);
        const index = this.input.items.indexOf(items[0]);
        this.listeners.onChangeSelection(index);
    }

    private onButton(button: QuickInputButton): void {
        if (button.tooltip === "Cancel") {
            this.input.hide();
        } else if (button.tooltip === "Accept") {
            this.listeners.onAccept();
        }
    }
}
