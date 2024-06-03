import { type Disposable } from "vscode";

export interface TimerFunctions<K> {
    startTimer: (callback: () => void) => K;
    cancelTimer: (key: K) => void;
}

// either allow the passing of a timeout *OR* a set of timer functions that can be used for manual timer firing
export type TimerParam<K> = K extends NodeJS.Timer ? number : TimerFunctions<K>;

/**
 * Timer is an encapsulation around setTimeout, which allows a single action to be re-executed or cancelled
 * after scheduling.
 *
 * This function is slightly overly generic to allow for extensibility of this timer in testing (without having to depend on time)
 */
export class Timer<K = NodeJS.Timer> implements Disposable {
    private timerKey: K | null;
    private action: () => void;
    private timerFunctions: TimerFunctions<K>;

    /**
     * @param action The action to fire on timer expiry
     * @param timerParam In most normal use, this will be a timeout, in ms. However, to facilitate testing, this can also be a TimerFunctions<K>.
     */
    constructor(action: () => void, timerParam: TimerParam<K>) {
        this.action = action;
        this.timerKey = null;

        if (typeof timerParam === "number") {
            const timeout = timerParam;
            // @ts-expect-error We know this will be valid, because if the spread params
            this.timerFunctions = {
                startTimer: (callback) => setTimeout(callback, timeout),
                cancelTimer: clearTimeout,
            } as TimerFunctions<NodeJS.Timer>;
        } else {
            this.timerFunctions = timerParam;
        }
    }

    /**
     * Restart the current timer, cancelling any previous timers if they exist. The action function will not be called
     * until the timeout fully re-expires.
     */
    restart(): void {
        this.cancel();
        this.timerKey = this.timerFunctions.startTimer(() => {
            this.action();
            this.timerKey = null;
        });
    }

    /**
     * Cancel the given timer. The action function will not be called unless this timer is restarted.
     */
    cancel(): void {
        if (this.timerKey === null) {
            return;
        }

        this.timerFunctions.cancelTimer(this.timerKey);
        this.timerKey = null;
    }

    /**
     * @returns Whether or not the action function is waiting to be called
     */
    isPending(): boolean {
        return this.timerKey !== null;
    }

    dispose(): void {
        this.cancel();
    }
}
