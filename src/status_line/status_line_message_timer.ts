import { type Disposable } from "vscode";

import { Timer } from "../utils/timer";

export enum ClearAction {
    StagedClear,
    PerformedClear,
}

/**
 * A timer that ensures that the status line is shown for a minimum amount of time before it is cleared.
 */
export class StatusLineMessageTimer implements Disposable {
    private doClear: () => void;
    private timer: Timer;
    private clearPending: boolean = false;

    constructor(doClear: () => void, minTime: number) {
        this.doClear = doClear;
        this.timer = new Timer(() => this.onTimerExpired(), minTime);
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
