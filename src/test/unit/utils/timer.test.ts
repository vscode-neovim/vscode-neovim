import { strict as assert } from "assert";

import { Timer } from "../../../utils/timer";

function makeEventPromise(): [Promise<void>, () => void] {
    let resolve;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });

    // We know by construction resolve will be a function type
    return [promise, resolve!];
}

describe("Timer", () => {
    it("should call the action function once per timeout with a Timeout kind", async () => {
        const [promise, resolvePromise] = makeEventPromise();
        let calls = 0;
        const timer = new Timer(() => {
            calls++;
            resolvePromise();
        }, 10);

        timer.restart();

        await promise;

        assert.equal(calls == 1, true, `Expected at least one call, had ${calls}`);
    });

    it("should not do anything if restart() is not called", (done) => {
        let calls = 0;

        new Timer(() => {
            calls++;
        }, 10);

        setTimeout(() => {
            assert.equal(0, calls);
            done();
        }, 50);
    });

    it("should stop the timer if restart is called", (done) => {
        let calls = 0;

        const timer = new Timer(() => {
            calls++;
        }, 10);

        timer.restart();
        timer.restart();
        const callsAfterRestart = calls;

        setTimeout(() => {
            assert.equal(callsAfterRestart + 1, calls, "Should not have been called again after restart");
            done();
        }, 50);
    });

    it("should stop the timer if cancel is called", (done) => {
        let calls = 0;

        const timer = new Timer(() => {
            calls++;
        }, 10);

        timer.restart();
        timer.cancel();
        const callsAfterCancel = calls;

        setTimeout(() => {
            assert.equal(callsAfterCancel, calls, "Should not have been called again after cancellation");
            done();
        }, 50);
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
