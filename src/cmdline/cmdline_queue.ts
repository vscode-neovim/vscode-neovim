import { type EventBusData } from "../eventBus";

/**
 * A queue for "batching" cmdline events.
 *
 * In the most simple cases, events will simply be passed through and not queued. However, there is a more complicated=
 * case we must deal with. There is an inherent "race condition" (NB: it's not really a race condition, rather a result
 * of how the JS event loop works, but it's easiest to think of it as a race) between quickpick hide events and cmdline_* events from nvim. If there is a
 * cmdline_hide, followed immediately by a cmdline_show, we may call hide() on the quickpick, but onHide will not
 * be fired until our event handlers have completed execution, leading to bizarre and confusing states. As such,
 * we "queue" events until we know for sure that the quickpick has bene hidden, and then allow them to be flushed back
 * to the cmdline_manager.
 */
export class CmdlineQueue {
    private pendingBatches: EventBusData<"redraw">[][] = [];
    private needFlush: boolean = false;
    private level: number | null = null;

    /**
     * Given a newovim event, checks whether or not the caller should handle
     * this event. If this returns false, the event is enqueued for later re-emission.
     *
     * @param event
     * @returns
     */
    handleNvimRedrawEvent(event: EventBusData<"redraw">): boolean {
        const shouldProcess = !this.needFlush;
        if (this.needFlush) {
            this.addToBatch(event);
        }

        if (event.name === "cmdline_show") {
            const [_content, _pos, _firstc, _prompt, _indent, level] = event.args[0];
            this.level = level;
        } else if (event.name === "cmdline_hide" && this.level === 1) {
            this.prepareBatch();
        }

        return shouldProcess;
    }

    /**
     * Flush the currently pending batch, and remove it from the queue
     *
     * @returns The next batch of pending events, or null if none are pending
     */
    flushBatch(): EventBusData<"redraw">[] | null {
        const result = this.pendingBatches.shift() ?? null;
        this.needFlush = false;
        this.level = null;

        return result;
    }

    private prepareBatch() {
        this.pendingBatches.push([]);
        this.needFlush = true;
        this.level = null;
    }

    private addToBatch(event: EventBusData<"redraw">) {
        if (this.pendingBatches.length === 0) {
            // No batch to add this to. We can't safely assume we should make a new batch (but this should
            // never happen)
            throw new Error("Invalid cmdline state");
        }

        const batch = this.pendingBatches[this.pendingBatches.length - 1];
        batch.push(event);
    }
}
