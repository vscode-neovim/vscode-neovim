import { strict as assert } from "assert";

import { StatusLineMessageTimer } from "../../../status_line/status_line_message_timer";

describe("StatusLineMessageTimer", () => {
    it("should not call the clear function if no clear is sent", (done) => {
        let called = false;
        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, 10);

        timer.onMessageEvent();

        setTimeout(() => {
            assert.equal(called, false);
            done();
        }, 50);
    });

    it("should call the clear function after the given timeout if a clear is sent", (done) => {
        const timer = new StatusLineMessageTimer(() => {
            // Getting here is sufficient to pass the test. Otherwise, the test will time out
            done();
        }, 10);

        timer.onMessageEvent();
        timer.onClearEvent();
    });

    it("should call the clear function immediately if the timer has already expired", (done) => {
        let called = false;
        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, 10);

        timer.onMessageEvent();
        setTimeout(() => {
            // This should not have been called before the timeout
            assert.equal(called, false);
            timer.onClearEvent();
            // And we should immediately have called it now that nothing is pending
            assert.equal(called, true);
            done();
        }, 50);
    });

    it("should call the clear function immediately if the timer has already expired", (done) => {
        let called = false;
        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, 10);

        timer.onMessageEvent();
        setTimeout(() => {
            // This should not have been called before the timeout
            assert.equal(called, false);
            timer.onClearEvent();
            // And we should immediately have called it now that nothing is pending
            assert.equal(called, true);
            done();
        }, 50);
    });

    it("should not call the clear function if a new message has been sent without a clear", (done) => {
        let called = false;
        const timer = new StatusLineMessageTimer(() => {
            called = true;
        }, 10);

        timer.onMessageEvent();
        timer.onClearEvent();

        // Send a new message, which should prevent the old timer from firing
        timer.onMessageEvent();

        setTimeout(() => {
            assert.equal(called, false);
            done();
        }, 50);
    });
});
