export function findLastEvent(name: string, batch: [string, ...unknown[]][]): [string, ...unknown[]] | undefined {
    for (let i = batch.length - 1; i >= 0; i--) {
        const [event] = batch[i];
        if (event === name) {
            return batch[i];
        }
    }
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

export class WaitGroup {
    private manualPromise: ManualPromise | null = null;
    private count: number = 0;

    add() {
        if (this.count === 0) {
            this.manualPromise = new ManualPromise();
        }

        this.count++;
    }

    done() {
        if (this.count > 0) {
            this.count--;
        }

        if (!this.manualPromise || this.count > 0) {
            return;
        }

        this.manualPromise.resolve();
        // Should be true, but defensively we can ensure this doesn't go negative
        this.count = 0;
    }

    get promise(): Promise<void> {
        if (this.manualPromise == null) {
            return Promise.resolve(undefined);
        }

        return this.manualPromise.promise;
    }
}

/**
 * Wait for a given number of milliseconds
 * @param ms Number of milliseconds
 */
export async function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
