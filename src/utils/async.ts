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
