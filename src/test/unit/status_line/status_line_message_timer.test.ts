import { strict as assert } from "assert";

import { StatusLineMessageTimer } from "../../../status_line/status_line_message_timer";
import { TimerFunctions } from "../../../utils";

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

describe("StatusLineMessageTimer", () => {
    it("should not call the clear function if no clear is sent", () => {
        const timerContainer = new ManualTimerContainer();

        let called = false;
        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, timerContainer);

        timer.onMessageEvent();
        timerContainer.fireTimer(1);

        assert.equal(called, false);
    });

    it("should call the clear function after the given timeout if a clear is sent", () => {
        const timerContainer = new ManualTimerContainer();
        let called = false;

        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, timerContainer);

        timer.onMessageEvent();
        timer.onClearEvent();

        assert.equal(called, false, "precondition of test failed: clear function should not have been called yet");

        timerContainer.fireTimer(1);

        assert.equal(called, true);
    });

    it("should call the clear function immediately upon getting a clear event if the timer has already expired", () => {
        const timerContainer = new ManualTimerContainer();

        let called = false;
        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, timerContainer);

        timer.onMessageEvent();
        timerContainer.fireTimer(1);

        // This should not have been called before the timer expired
        assert.equal(called, false, "test precondition failed: clear function should not have been called yet");

        timer.onClearEvent();
        // And we should immediately have called it, without a timer now that nothing is pending
        assert.equal(called, true);
    });

    it("should not call the clear function if a new message has been sent without a clear before the initial timer expires", () => {
        const timerContainer = new ManualTimerContainer();
        let called = false;
        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, timerContainer);

        timer.onMessageEvent();
        // We got a clear event *WITHOUT* firing the initial timer
        timer.onClearEvent();

        // Send a new message, which should replace the old timer
        timer.onMessageEvent();

        // If timer 1 is gone, we know that it has been cancelled and would not fire
        assert.equal(timerContainer.timerExists(1), false);

        // For good measure, fire timer two to show that the previous onClearEvent does not affect this
        timerContainer.fireTimer(2);
        assert.equal(called, false, "Clear function should not have been called");
    });

    it("should not call the clear function if a new message has been sent, even if the old timer has expired", () => {
        const timerContainer = new ManualTimerContainer();
        let calls = 0;
        const timer = new StatusLineMessageTimer(() => {
            calls++;
        }, timerContainer);

        timer.onMessageEvent();
        timer.onClearEvent();
        timerContainer.fireTimer(1);
        // We expect the clear function to have been called
        assert.equal(calls, 1, "precondition of test failed; clearing did not work as expected");

        timer.onMessageEvent();
        timerContainer.fireTimer(2);

        // Because we received no second clear event, we should not have called the clear function again
        assert.equal(calls, 1, `clear function was called more times than expected, expected 1, got ${calls}`);
    });
});
