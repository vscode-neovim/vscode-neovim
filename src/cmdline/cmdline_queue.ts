import { type EventBusData } from "../eventBus";

/**
 * A queue for "batching" cmdline events.
 *
 * In most cases (simple command-line usage like :w<CR>), events will be passed through and not queued. However, in more
 * complicated cases, we need to take "batch" different cmdline events. Due to how the JS event loop works, VSCode's
 * QuickPick onHide event will not execute until after we have processed all of our events, even if they belong to
 * different instances of the cmdline. Worse, an onHide may even precede our cmdline_hide. As such, we queue up
 * batches of events to retransmit back to the CmdlineManager.
 */
export class CmdlineQueue {
    private pendingBatches: EventBusData<"redraw">[][] = [];
    private needFlush: boolean = false;
    private lastSeenLevel: number | null = null;

    /**
     * Given an nvim redraw event, checks whether or not the caller should handle this event. If this returns false, the
     * event is enqueued for a future call to `flushBatch`
     *
     * @param event The redraw event received from nvim
     * @returns Whether or not this event should be processed immediately
     */
    handleNvimRedrawEvent(event: EventBusData<"redraw">): boolean {
        const shouldProcess = !this.needFlush;
        if (this.needFlush) {
            this.addToBatch(event);
        }

        if (event.name === "cmdline_show") {
            const [_content, _pos, _firstc, _prompt, _indent, level] = event.args[0];
            this.lastSeenLevel = level;
        } else if (event.name === "cmdline_hide" && this.lastSeenLevel === 1) {
            // Only make a new batch when we're preforming a hide for a known level 1 cmdline
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
        this.lastSeenLevel = null;

        return result;
    }

    private prepareBatch() {
        this.pendingBatches.push([]);
        this.needFlush = true;
        this.lastSeenLevel = null;
    }

    private addToBatch(event: EventBusData<"redraw">) {
        if (this.pendingBatches.length === 0) {
            // No batch to add this to. We can't safely assume we should make a new batch (but this should never happen)
            throw new Error("Invalid cmdline state");
        }

        const batch = this.pendingBatches[this.pendingBatches.length - 1];
        batch.push(event);
    }
}
