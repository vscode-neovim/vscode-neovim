import { strict as assert } from "assert";

import { WaitGroup } from "../../../utils/async";

function withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(new Error("timed out"));
        }, timeout);

        promise.then(resolve);
    });
}

describe("WaitGroup", () => {
    it("should resolve immediately on a new object", async () => {
        const wg = new WaitGroup();

        await withTimeout(wg.promise, 100);
    });

    it("should wait forever if there are an imbalanced number of add calls", async () => {
        const wg = new WaitGroup();
        wg.add();
        wg.add();
        wg.done();

        let resolved = false;
        await withTimeout(wg.promise, 100)
            .then(() => {
                resolved = true;
            })
            .catch(() => {
                /* nop */
            });

        assert.equal(resolved, false);
    });

    it("should resolve immediately if we mark the group as done the correct number of times", async () => {
        const wg = new WaitGroup();

        wg.add();
        wg.add();
        wg.done();
        wg.done();

        let resolved = false;
        await withTimeout(wg.promise, 100)
            .then(() => {
                resolved = true;
            })
            .catch(() => {
                /* nop */
            });

        assert.equal(resolved, true);
    });
});
