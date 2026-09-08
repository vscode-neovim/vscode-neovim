export function findLastEvent(name: string, batch: [string, ...unknown[]][]): [string, ...unknown[]] | undefined {
    return batch.findLast(([event]) => event === name);
}

/**
 * Manual promise that can be resolved/rejected from outside. Used in document and cursor managers to indicate pending update.
 */
export class ManualPromise {
    public promise: Promise<void>;
    public resolve: () => void = () => {
        // noop
    };
    public reject: () => void = () => {
        // noop
    };

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        this.promise.catch((_err) => {
            // noop
        });
    }
}

/**
 * Wait for a given number of milliseconds
 * @param ms Number of milliseconds
 */
export async function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits for an expected state, until `assertion` does not throw an error.
 * Rethrows the last failure on `timeout`.
 *
 * @param assertion Throws while the expected state has not been reached.
 * @param timeout Time (ms) to keep retrying before giving up.
 * @param interval Time (ms) between attempts.
 */
export async function waitUntil(assertion: () => void | Promise<void>, timeout = 3000, interval = 50): Promise<void> {
    const deadline = Date.now() + timeout;
    for (;;) {
        try {
            await assertion();
            return;
        } catch (e) {
            if (Date.now() >= deadline) {
                throw e;
            }
        }
        await wait(interval);
    }
}
