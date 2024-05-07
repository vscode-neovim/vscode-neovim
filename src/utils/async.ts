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

/**
 * WaitGroup tracks the progress of multiple asynchronous tasks, allowing a caller to wait for all tasks to complete.
 *
 * Before each task is spawned, a consumer will call `add` for each spawned task, to indicate that there is a new task
 * to wait for. Each task independently marks itself as done with the `done` method. Once the number of `done` calls
 * equals the number of `add` calls, the promise resolves, and a consumer will know the tasks are complete.
 *
 * This is useful in contrast to `Promise.all`/`Promise.allSettled`, where it may not be easily determinable up front
 * how many tasks you are waiting on (e.g. if you wish all event handler functions for event A to fully complete
 * before an event handler for event B runs).
 */
export class WaitGroup {
    private manualPromise: ManualPromise | null = null;
    private count: number = 0;

    /**
     * Add a task to the wait group
     */
    add() {
        if (this.count === 0) {
            this.manualPromise = new ManualPromise();
        }

        this.count++;
    }

    /**
     * Mark a previously `add`'d task as done.
     */
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

    /**
     * A promise that is pending if there are outstanding tasks, and resolves when they are complete.
     */
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
