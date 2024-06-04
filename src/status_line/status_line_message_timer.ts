import { DebouncedFunc, debounce } from "lodash";
import { type Disposable } from "vscode";

export enum ClearAction {
    StagedClear,
    PerformedClear,
}

/**
 * A timer that ensures that the status line is shown for a minimum amount of time before it is cleared.
 */
export class StatusLineMessageTimer implements Disposable {
    private doClear: () => void;
    private debouncedDoClear: DebouncedFunc<() => void>;
    // Whether or not the debounced function has been called, but has not yet executed
    private debouncePending: boolean = false;
    // Whether or not a clear has been staged for once the debounced function is complete
    private clearPending: boolean = false;

    /**
     * @param doClear The function to call when it is time to clear the status line
     * @param timeout In most normal use, this will be a timeout
     */
    constructor(doClear: () => void, timeout: number) {
        this.doClear = doClear;
        this.debouncedDoClear = debounce(() => this.onDebounceReady(), timeout);
    }

    dispose(): void {
        this.debouncedDoClear.cancel();
    }

    /**
     * A msg_show event has come in from neovim
     */
    onMessageEvent() {
        this.debouncedDoClear();
        this.debouncePending = true;
        this.clearPending = false;
    }

    /**
     * A msg_clear event has come in from neovim
     */
    onClearEvent(): ClearAction {
        if (this.debouncePending) {
            this.clearPending = true;
            return ClearAction.StagedClear;
        }

        this.doClear();
        return ClearAction.PerformedClear;
    }

    private onDebounceReady(): void {
        this.debouncePending = false;

        if (this.clearPending) {
            this.doClear();
        }

        this.clearPending = false;
    }
}
