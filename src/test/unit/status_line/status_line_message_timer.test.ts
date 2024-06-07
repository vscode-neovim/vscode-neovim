import { strict as assert } from "assert";

import * as sinon from "@sinonjs/fake-timers";

import { StatusLineMessageTimer } from "../../../status_line/status_line_message_timer";

describe("StatusLineMessageTimer", () => {
    let clock: sinon.InstalledClock;
    beforeEach(() => {
        clock = sinon.install();
    });

    afterEach(() => {
        clock.uninstall();
    });

    it("should not call the clear function if no clear is sent", () => {
        let called = false;
        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, 5000);

        timer.onMessageEvent();
        clock.tick(5000);

        assert.equal(called, false);
    });

    it("should call the clear function after the given timeout if a clear is sent", () => {
        let called = false;

        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, 5000);

        timer.onMessageEvent();
        timer.onClearEvent();

        assert.equal(called, false, "precondition of test failed: clear function should not have been called yet");

        clock.tick(5000);

        assert.equal(called, true);
    });

    it("should call the clear function immediately upon getting a clear event if the timeout has already expired", () => {
        let called = false;
        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, 5000);

        timer.onMessageEvent();
        clock.tick(5000);

        // This should not have been called before the timeout expired
        assert.equal(called, false, "test precondition failed: clear function should not have been called yet");

        timer.onClearEvent();
        // And we should immediately have called it, now that the timeout has already expired
        assert.equal(called, true);
    });

    it("should not call the clear function if a new message has been sent without a clear before the initial timer expires", () => {
        let called = false;
        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, 5000);

        timer.onMessageEvent();
        // We got a clear event *WITHOUT* expiring the timeout fully.
        timer.onClearEvent();
        clock.tick(1000);

        // Send a new message, which should reset the timeout
        timer.onMessageEvent();
        clock.tick(5000);

        assert.equal(called, false, "Clear function should not have been called");
    });

    it("should not call the clear function if a new message has been sent, even if the old timer has expired", () => {
        let calls = 0;
        const timer = new StatusLineMessageTimer(() => {
            calls++;
        }, 5000);

        timer.onMessageEvent();
        timer.onClearEvent();
        clock.tick(5000);

        // We expect the clear function to have been called
        assert.equal(calls, 1, "precondition of test failed; clearing did not work as expected");

        timer.onMessageEvent();
        clock.tick(5000);

        // Because we received no second clear event, we should not have called the clear function again
        assert.equal(calls, 1, `clear function was called more times than expected, expected 1, got ${calls}`);
    });
});
