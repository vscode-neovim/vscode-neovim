import { strict as assert } from "assert";

import { CmdlineQueue } from "../../../cmdline/cmdline_queue";
import { type EventBusData } from "../../../eventBus";

describe("handleNvimEvent", () => {
    it("returns true for cmdline_show/cmdline_hide events inserted at first", () => {
        const queue = new CmdlineQueue();

        const events: EventBusData<"redraw">[] = [
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "wq"]], 0, ":", "", 0, 1]] },
            { name: "cmdline_hide" as const, args: undefined },
        ];

        events.forEach((event, i) => {
            assert.equal(queue.handleNvimRedrawEvent(event), true, `Event ${i} did not return true`);
        });
    });

    it("returns false for subsequent cmdline_shows given after a cmdline_hide", () => {
        const queue = new CmdlineQueue();

        const batch1: EventBusData<"redraw">[] = [
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
            { name: "cmdline_hide" as const, args: undefined },
        ];

        const batch2: EventBusData<"redraw">[] = [
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
        ];

        batch1.forEach((event, i) => {
            assert.equal(queue.handleNvimRedrawEvent(event), true, `Event ${i} did not return true`);
        });

        batch2.forEach((event, i) => {
            assert.equal(queue.handleNvimRedrawEvent(event), false, `Event ${i} did not return false`);
        });
    });

    it("should stage the event for when flushBatch is called", () => {
        const queue = new CmdlineQueue();

        const batch1: EventBusData<"redraw">[] = [
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
            { name: "cmdline_hide" as const, args: undefined },
        ];

        const batch2: EventBusData<"redraw">[] = [
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
        ];

        batch1.forEach((event, i) => {
            assert.equal(queue.handleNvimRedrawEvent(event), true, `Event ${i} did not return true`);
        });

        batch2.forEach((event, i) => {
            assert.equal(queue.handleNvimRedrawEvent(event), false, `Event ${i} did not return false`);
        });

        assert.deepEqual(queue.flushBatch(), batch2);
    });

    it("does not return false after cmdline_hides for level changes", () => {
        const queue = new CmdlineQueue();

        const batch1: EventBusData<"redraw">[] = [
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, "=", "", 0, 2]] },
            { name: "cmdline_hide" as const, args: undefined },
        ];

        const batch2: EventBusData<"redraw">[] = [
            { name: "cmdline_show" as const, args: [[[[{}, "value"]], 0, ":", "", 0, 1]] },
            { name: "cmdline_hide" as const, args: undefined },
        ];

        batch1.forEach((event, i) => {
            assert.equal(queue.handleNvimRedrawEvent(event), true, `Event ${i} did not return true`);
        });

        batch2.forEach((event, i) => {
            assert.equal(queue.handleNvimRedrawEvent(event), true, `Event ${i} did not return true`);
        });
    });

    it("should not consider a lone cmdline_hide as a trigger for a queue", () => {
        const queue = new CmdlineQueue();

        queue.handleNvimRedrawEvent({ name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] });
        // Flush the batch externally. Would occur w/o a cmdline_hide if someone hid the quickpick from vscode
        queue.flushBatch();

        queue.handleNvimRedrawEvent({ name: "cmdline_hide" as const, args: undefined });
        // A defective implementation would return false here, as it would indicate events are now being queued
        assert.equal(
            queue.handleNvimRedrawEvent({ name: "cmdline_show" as const, args: [[[[{}, "value"]], 0, ":", "", 0, 1]] }),
            true,
        );
    });
});

describe("flushBatch", () => {
    it("returns null when nothing is queued", () => {
        const queue = new CmdlineQueue();
        assert.equal(queue.flushBatch(), null);
    });

    it("returns null after staged events are flushed", () => {
        const queue = new CmdlineQueue();
        const events: EventBusData<"redraw">[] = [
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
            { name: "cmdline_hide" as const, args: undefined },
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
        ];

        events.forEach((event) => {
            queue.handleNvimRedrawEvent(event);
        });

        assert.notEqual(queue.flushBatch(), null);
        assert.equal(queue.flushBatch(), null);
    });

    it("allows queueing of events once a flush occurs", () => {
        const queue = new CmdlineQueue();
        const events: EventBusData<"redraw">[] = [
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
            { name: "cmdline_hide" as const, args: undefined },
        ];

        events.forEach((event) => {
            queue.handleNvimRedrawEvent(event);
        });

        queue.flushBatch();

        events.forEach((event, i) => {
            assert.equal(queue.handleNvimRedrawEvent(event), true, `Event ${i} did not return true`);
        });
    });

    it("should flush more than one batch", () => {
        const queue = new CmdlineQueue();
        const events: EventBusData<"redraw">[] = [
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
            { name: "cmdline_hide" as const, args: undefined },
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
            { name: "cmdline_hide" as const, args: undefined },
            { name: "cmdline_show" as const, args: [[[[{}, ""]], 0, ":", "", 0, 1]] },
            { name: "cmdline_show" as const, args: [[[[{}, "w"]], 0, ":", "", 0, 1]] },
            { name: "cmdline_hide" as const, args: undefined },
        ];

        events.forEach((event) => {
            queue.handleNvimRedrawEvent(event);
        });

        assert.notEqual(queue.flushBatch(), null, "Batch 0 did not flush");
        assert.notEqual(queue.flushBatch(), null, "Batch 1 did not flush");
        assert.notEqual(queue.flushBatch(), null, "Batch 2 did not flush");
        assert.equal(queue.flushBatch(), null, "More than 3 batches");
    });
});
