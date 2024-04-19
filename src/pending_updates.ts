/**
 * Holds a set of batched updates to perform, bucketed by some type of resource identifier (K).
 */
export class PendingUpdates<K> {
    private pendingUpdates: Map<K, (() => boolean)[]>;

    constructor() {
        this.pendingUpdates = new Map();
    }

    /**
     * @returns The number of resources which are staged to update
     */
    size(): number {
        return this.pendingUpdates.size;
    }

    /**
     * Get all resources pending updates, and functions which indicate whether or not the updates performed
     * any changes.
     *
     * @returns An array of [K, updateFUnction] pairs. The updateFUnction will
     *          return true if that resource has been updated.
     */
    entries(): [K, () => boolean][] {
        return Array.from(this.pendingUpdates.entries()).map(([key, update]) => {
            // This cannot use checks.some(), as some() stops evaluation once an update returns true
            const anyValid = () => this.evaluateUpdates(update);
            return [key, anyValid];
        });
    }

    /**
     * Add a new update for the given resource.
     *
     * @param resource The resource that this check applies to
     * @param check A function that returns true if this resource should update.
     */
    addConditionalUpdate(resource: K, check: () => boolean) {
        this.push(resource, check);
    }

    /**
     * Indicate that this resource has been updated externally, and any post-update processing should run
     *
     * @param resource The resource that this update applies to
     */
    addForceUpdate(resource: K) {
        this.push(resource, () => true);
    }

    private evaluateUpdates(updates: (() => boolean)[]): boolean {
        let someUpdateDidChange = false;
        for (const update of updates) {
            const updateRes = update();
            if (updateRes) {
                someUpdateDidChange = true;
            }
        }

        return someUpdateDidChange;
    }

    private push(resource: K, check: () => boolean): void {
        const currentUpdates = this.pendingUpdates.get(resource) ?? [];
        currentUpdates.push(check);
        this.pendingUpdates.set(resource, currentUpdates);
    }
}
