import { strict as assert } from "assert";

import { Timer, TimerFunctions } from "../../../utils/timer";

function makeEventPromise(): [Promise<void>, () => void] {
    let resolve;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });

    // We know by construction resolve will be a function type
    return [promise, resolve!];
}

/**
 * Simulates a set of timer functions by keeping track of what timers are created and cleared, and allowing manual
 * firing of known timers.
 *
 * The ids are always incrementing.
 */
class ManualTimerContainer implements TimerFunctions<number> {
    private nextId = 1;
    private callbacks = new Map<number, () => void>();

    startTimer(callback: () => void): number {
        const id = this.nextId;
        this.callbacks.set(id, callback);
        this.nextId++;

        return id;
    }

    timerExists(key: number): boolean {
        return this.callbacks.has(key);
    }

    fireTimer(key: number): void {
        const callback = this.callbacks.get(key);
        if (!callback) {
            throw new Error("Test error: tried to fire a non-existent timer");
        }

        callback();
    }

    cancelTimer(key: number): void {
        this.callbacks.delete(key);
    }
}

describe("Timer", () => {
    it("should call the action function once per timeout with a Timeout kind", async () => {
        const timerContainer = new ManualTimerContainer();
        const [promise, resolvePromise] = makeEventPromise();
        let calls = 0;

        const timer = new Timer(() => {
            calls++;
            resolvePromise();
        }, timerContainer);

        timer.restart();
        timerContainer.fireTimer(1);

        await promise;

        assert.equal(calls == 1, true, `Expected at least one call, had ${calls}`);
    });

    it("should not do anything if restart() is not called", () => {
        const timerContainer = new ManualTimerContainer();

        new Timer(() => {
            assert.fail("Should not be called");
        }, timerContainer);

        // No timer should be created
        assert.equal(timerContainer.timerExists(1), false);
    });

    it("should start a new timer after calling restart", () => {
        const timerContainer = new ManualTimerContainer();

        const timer = new Timer(() => {
            assert.fail("Should not be called");
        }, timerContainer);

        timer.restart();
        assert.equal(timerContainer.timerExists(1), true, "No initial timer was created");

        timer.restart();
        assert.equal(timerContainer.timerExists(1), false, "The initial timer was not cleared");
        assert.equal(timerContainer.timerExists(2), true, "A new timer was not created");
    });

    it("should stop the timer if cancel is called", () => {
        const timerContainer = new ManualTimerContainer();

        const timer = new Timer(() => {
            assert.fail("Should not be called");
        }, timerContainer);

        timer.restart();
        assert.equal(timerContainer.timerExists(1), true, "No initial timer was created");

        timer.cancel();
        assert.equal(timerContainer.timerExists(1), false, "The initial timer was not cleared");
    });

    describe("isPending", () => {
        it("should be marked as not pending upon construction", () => {
            const timer = new Timer(() => {}, 1000);
            assert.equal(timer.isPending(), false);
        });

        it("should be marked as pending after restart is called", () => {
            const timer = new Timer(() => {}, 5000);
            timer.restart();
            assert.equal(timer.isPending(), true);
        });

        it("should be marked as pending until cancel is called", () => {
            const timer = new Timer(() => {}, 5000);
            timer.restart();
            assert.equal(timer.isPending(), true);

            timer.cancel();
            assert.equal(timer.isPending(), false);
        });
    });
});
