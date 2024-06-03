import { type Disposable } from "vscode";

/**
 * Timer is an encapsulation around setTimeout, which allows a single action to be re-executed or cancelled
 * after scheduling.
 */
export class Timer implements Disposable {
    private timer: NodeJS.Timeout | null;
    private timeout: number;
    private action: () => void;

    constructor(action: () => void, timeout: number) {
        this.action = action;
        this.timeout = timeout;
        this.timer = null;
    }

    /**
     * Restart the current timer, cancelling any previous timers if they exist. The action function will not be called
     * until the timeout fully re-expires.
     */
    restart(): void {
        this.cancel();
        this.timer = setTimeout(() => {
            this.action();
            this.timer = null;
        }, this.timeout);
    }

    /**
     * Cancel the given timer. The action function will not be called unless this timer is restarted.
     */
    cancel(): void {
        if (this.timer === null) {
            return;
        }

        clearTimeout(this.timer);
        this.timer = null;
    }

    /**
     * @returns Whether or not the action function is waiting to be called
     */
    isPending(): boolean {
        return this.timer !== null;
    }

    dispose(): void {
        this.cancel();
    }
}
