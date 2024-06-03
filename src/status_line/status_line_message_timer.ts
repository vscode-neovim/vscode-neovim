import { type Disposable } from "vscode";

import { Timer, TimerParam } from "../utils/timer";

export enum ClearAction {
    StagedClear,
    PerformedClear,
}

/**
 * A timer that ensures that the status line is shown for a minimum amount of time before it is cleared.
 */
export class StatusLineMessageTimer<K = NodeJS.Timer> implements Disposable {
    private doClear: () => void;
    private timer: Timer<K>;
    private clearPending: boolean = false;

    /**
     * @param doClear The function to call when it is time to clear the status line
     * @param timerParam In most normal use, this will be a timeout, in ms. However, to facilitate testing, this can
     * also be a TimerFunctions<K>.
     */
    constructor(doClear: () => void, timerParam: TimerParam<K>) {
        this.doClear = doClear;
        this.timer = new Timer(() => this.onTimerExpired(), timerParam);
    }

    dispose(): void {
        this.timer.dispose();
    }

    /**
     * A msg_show event has come in from neovim
     */
    onMessageEvent() {
        this.timer.restart();
        this.clearPending = false;
    }

    /**
     * A msg_clear event has come in from neovim
     */
    onClearEvent(): ClearAction {
        if (this.timer.isPending()) {
            this.clearPending = true;
            return ClearAction.StagedClear;
        }

        this.doClear();
        return ClearAction.PerformedClear;
    }

    private onTimerExpired(): void {
        if (this.clearPending) {
            this.doClear();
        }

        this.clearPending = false;
    }
}
