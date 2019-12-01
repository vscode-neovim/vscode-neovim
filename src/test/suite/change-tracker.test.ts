import { strict as assert } from "assert";

import { ChangeTracker } from "../../change_tracker";

describe("Change tracker test", () => {
    it("Line changes without overlapping ranges", () => {
        const t = new ChangeTracker();
        t.changeLine(0);
        t.changeLine(2);
        t.changeLine(4);

        assert.deepEqual(t.getChanges(), [
            { start: 0, end: 0, newStart: 0, newEnd: 0 },
            { start: 2, end: 2, newStart: 2, newEnd: 2 },
            { start: 4, end: 4, newStart: 4, newEnd: 4 },
        ]);
    });

    it("Changing same line", async () => {
        const t = new ChangeTracker();
        t.changeLine(1);
        t.changeLine(1);
        t.changeLine(1);

        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 1,
                newStart: 1,
                newEnd: 1,
            },
        ]);

        t.changeLine(2);
        t.changeLine(2);
        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 1,
                newStart: 1,
                newEnd: 1,
            },
            {
                start: 2,
                end: 2,
                newStart: 2,
                newEnd: 2,
            },
        ]);
    });

    it("Line changs with neighbor and overlapping ranges", async () => {
        const t = new ChangeTracker();
        t.changeLine(3);
        t.changeLine(4);

        assert.deepEqual(t.getChanges(), [
            {
                start: 3,
                end: 3,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 4,
            },
        ]);

        t.changeLine(2);
        assert.deepEqual(t.getChanges(), [
            {
                start: 2,
                end: 2,
                newStart: 2,
                newEnd: 2,
            },
            {
                start: 3,
                end: 3,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 4,
            },
        ]);

        t.changeLine(3);
        assert.deepEqual(t.getChanges(), [
            {
                start: 2,
                end: 2,
                newStart: 2,
                newEnd: 2,
            },
            {
                start: 3,
                end: 3,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 4,
            },
        ]);

        t.changeLine(0);
        assert.deepEqual(t.getChanges(), [
            {
                start: 0,
                end: 0,
                newStart: 0,
                newEnd: 0,
            },
            {
                start: 2,
                end: 2,
                newStart: 2,
                newEnd: 2,
            },
            {
                start: 3,
                end: 3,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 4,
            },
        ]);
        // // will combine both changes into one
        // t.changeLine(1);
        // assert.deepEqual(t.getChanges(), [
        //     {
        //         start: 0,
        //         end: 4,
        //         newStart: 0,
        //         newEnd: 4,
        //     },
        // ]);

        // t.changeLine(8);
        // t.changeLine(10);
        // assert.deepEqual(t.getChanges(), [
        //     {
        //         start: 0,
        //         end: 4,
        //         newStart: 0,
        //         newEnd: 4,
        //     },
        //     {
        //         start: 8,
        //         end: 8,
        //         newStart: 8,
        //         newEnd: 8,
        //     },
        //     {
        //         start: 10,
        //         end: 10,
        //         newStart: 10,
        //         newEnd: 10,
        //     },
        // ]);
        // t.changeLine(9);
        // assert.deepEqual(t.getChanges(), [
        //     {
        //         start: 0,
        //         end: 4,
        //         newStart: 0,
        //         newEnd: 4,
        //     },
        //     {
        //         start: 8,
        //         end: 10,
        //         newStart: 8,
        //         newEnd: 10,
        //     },
        // ]);
    });

    it("Changing added line", async () => {
        const t = new ChangeTracker();
        t.addNewLineFrom(1);
        t.changeLine(1);
        t.changeLine(2);

        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 1,
                newStart: 1,
                newEnd: 2,
            },
        ]);
    });

    it("Line adding - wihout overlapping", async () => {
        const t = new ChangeTracker();
        t.addNewLineFrom(0);
        assert.deepEqual(t.getChanges(), [
            {
                start: 0,
                end: 0,
                newStart: 0,
                newEnd: 1,
            },
        ]);

        t.addNewLineFrom(3);
        assert.deepEqual(t.getChanges(), [
            {
                start: 0,
                end: 0,
                newStart: 0,
                newEnd: 1,
            },
            // shift by -1 since newline was added before
            {
                start: 2,
                end: 2,
                newStart: 3,
                newEnd: 4,
            },
        ]);
    });

    it("Line adding - overlapping", async () => {
        const t = new ChangeTracker();
        t.addNewLineFrom(2);
        t.addNewLineFrom(3);

        assert.deepEqual(t.getChanges(), [
            {
                start: 2,
                end: 2,
                newStart: 2,
                newEnd: 4,
            },
        ]);

        t.addNewLineFrom(1);
        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 1,
                newStart: 1,
                newEnd: 2,
            },
            {
                start: 2,
                end: 2,
                newStart: 3,
                newEnd: 5,
            },
        ]);

        t.addNewLineFrom(5);
        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 1,
                newStart: 1,
                newEnd: 2,
            },
            {
                start: 2,
                end: 2,
                newStart: 3,
                newEnd: 6,
            },
        ]);

        t.addNewLineFrom(10);
        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 1,
                newStart: 1,
                newEnd: 2,
            },
            {
                start: 2,
                end: 2,
                newStart: 3,
                newEnd: 6,
            },
            {
                start: 6,
                end: 6,
                newStart: 10,
                newEnd: 11,
            },
        ]);
    });

    it("Line adding without overlapping - 2", async () => {
        const t = new ChangeTracker();
        t.addNewLineFrom(1);
        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 1,
                newStart: 1,
                newEnd: 2,
            },
        ]);

        t.addNewLineFrom(3);
        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 1,
                newStart: 1,
                newEnd: 2,
            },
            {
                start: 2,
                end: 2,
                newStart: 3,
                newEnd: 4,
            },
        ]);
    });

    it("Line adding within existing range", async () => {
        const t = new ChangeTracker();
        t.changeLine(3);
        t.changeLine(4);
        t.changeLine(5);
        t.addNewLineFrom(4);

        assert.deepEqual(t.getChanges(), [
            {
                start: 3,
                end: 3,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 5,
            },
            {
                start: 5,
                end: 5,
                newStart: 6,
                newEnd: 6,
            },
        ]);
    });

    it("Adding same line", async () => {
        const t = new ChangeTracker();
        t.addNewLineFrom(2);
        t.addNewLineFrom(2);
        t.addNewLineFrom(2);
        assert.deepEqual(t.getChanges(), [
            {
                start: 2,
                end: 2,
                newStart: 2,
                newEnd: 5,
            },
        ]);
    });

    it("Adding new line increase newStart/newEnd of subsequent lines", async () => {
        const t = new ChangeTracker();
        t.changeLine(1);

        t.changeLine(7);
        t.addNewLineFrom(7);

        t.addNewLineFrom(4);

        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 1,
                newStart: 1,
                newEnd: 1,
            },
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 5,
            },
            {
                start: 7,
                end: 7,
                // pushed one line down since we have added new line 5
                newStart: 8,
                newEnd: 9,
            },
        ]);
    });

    it("Changing added line", async () => {
        const t = new ChangeTracker();
        t.addNewLineFrom(4);
        t.changeLine(5);

        assert.deepEqual(t.getChanges(), [
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 5,
            },
        ]);
    });

    it("Removing lines without overlapping", async () => {
        const t = new ChangeTracker();
        t.removeLineFrom(4);

        assert.deepEqual(t.getChanges(), [
            {
                start: 4,
                end: 5,
                newStart: 4,
                newEnd: 4,
            },
        ]);

        t.removeLineFrom(5);
        assert.deepEqual(t.getChanges(), [
            {
                start: 4,
                end: 5,
                newStart: 4,
                newEnd: 4,
            },
            {
                start: 6,
                end: 7,
                newStart: 5,
                newEnd: 5,
            },
        ]);
    });

    it("Removing line within existing change range", async () => {
        const t = new ChangeTracker();
        t.changeLine(0);
        t.changeLine(1);
        t.changeLine(2);

        t.removeLineFrom(0);

        assert.deepEqual(t.getChanges(), [
            {
                start: 0,
                end: 1,
                newStart: 0,
                newEnd: 0,
            },
            {
                start: 2,
                end: 2,
                newStart: 1,
                newEnd: 1,
            },
        ]);

        t.removeLineFrom(0);
        assert.deepEqual(t.getChanges(), [
            {
                start: 0,
                end: 2,
                newStart: 0,
                newEnd: 0,
            },
        ]);
    });

    it("Removing line within existing change range - 2", async () => {
        const t = new ChangeTracker();
        t.changeLine(0);
        t.changeLine(1);
        t.changeLine(2);

        t.removeLineFrom(1);

        assert.deepEqual(t.getChanges(), [
            {
                start: 0,
                end: 0,
                newStart: 0,
                newEnd: 0,
            },
            {
                start: 1,
                end: 2,
                newStart: 1,
                newEnd: 1,
            },
        ]);

        t.removeLineFrom(0);
        assert.deepEqual(t.getChanges(), [
            {
                start: 0,
                end: 2,
                newStart: 0,
                newEnd: 0,
            },
        ]);
    });

    it("Removing line with overlapping ranges", async () => {
        const t = new ChangeTracker();
        t.removeLineFrom(1);
        t.removeLineFrom(2);

        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 2,
                newStart: 1,
                newEnd: 1,
            },
            {
                start: 3,
                end: 4,
                newStart: 2,
                newEnd: 2,
            },
        ]);

        t.removeLineFrom(6);
        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 2,
                newStart: 1,
                newEnd: 1,
            },
            {
                start: 3,
                end: 4,
                newStart: 2,
                newEnd: 2,
            },
            {
                start: 8,
                end: 9,
                newStart: 6,
                newEnd: 6,
            },
        ]);
        t.removeLineFrom(5);
        assert.deepEqual(t.getChanges(), [
            {
                start: 1,
                end: 2,
                newStart: 1,
                newEnd: 1,
            },
            {
                start: 3,
                end: 4,
                newStart: 2,
                newEnd: 2,
            },
            {
                start: 7,
                end: 9,
                newStart: 5,
                newEnd: 5,
            },
        ]);
    });

    it("Removing same line multiple times", async () => {
        const t = new ChangeTracker();
        t.removeLineFrom(3);
        t.removeLineFrom(3);
        t.removeLineFrom(3);

        assert.deepEqual(t.getChanges(), [
            {
                start: 3,
                end: 6,
                newStart: 3,
                newEnd: 3,
            },
        ]);
    });

    it("Removing lines shift existing changes", async () => {
        const t = new ChangeTracker();
        t.changeLine(2);
        t.changeLine(10);
        t.removeLineFrom(6);

        assert.deepEqual(t.getChanges(), [
            {
                start: 2,
                end: 2,
                newStart: 2,
                newEnd: 2,
            },
            {
                start: 6,
                end: 7,
                newStart: 6,
                newEnd: 6,
            },
            {
                start: 10,
                end: 10,
                newStart: 9,
                newEnd: 9,
            },
        ]);
    });

    it("Removing newly added line", async () => {
        const t = new ChangeTracker();
        t.addNewLineFrom(4);
        t.removeLineFrom(4);
        assert.deepEqual(t.getChanges(), [
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 4,
            },
        ]);
    });

    it("Removing one of two added lines", async () => {
        const t = new ChangeTracker();
        t.addNewLineFrom(4);
        t.addNewLineFrom(5);
        t.removeLineFrom(4);

        assert.deepEqual(t.getChanges(), [
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 5,
            },
        ]);
    });

    it("Adding line before a changed line", async () => {
        const t = new ChangeTracker();
        t.changeLine(1);
        t.addNewLineFrom(0);

        assert.deepEqual(t.getChanges(), [
            {
                start: 0,
                end: 0,
                newStart: 0,
                newEnd: 1,
            },
            {
                start: 1,
                end: 1,
                newStart: 2,
                newEnd: 2,
            },
        ]);
    });

    it("Adding line after removing", async () => {
        const t = new ChangeTracker();
        t.removeLineFrom(3);
        t.addNewLineFrom(3);

        assert.deepEqual(t.getChanges(), [
            {
                start: 3,
                end: 3,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 4,
            },
        ]);
        t.changeLine(4);
        assert.deepEqual(t.getChanges(), [
            {
                start: 3,
                end: 3,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 4,
                end: 4,
                newStart: 4,
                newEnd: 4,
            },
        ]);
    });

    it("Changing line after deleting", async () => {
        const t = new ChangeTracker();
        t.removeLineFrom(3);
        t.changeLine(4);

        assert.deepEqual(t.getChanges(), [
            {
                start: 3,
                end: 4,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 5,
                end: 5,
                newStart: 4,
                newEnd: 4,
            },
        ]);
    });

    it("adding & removing & changing", async () => {
        const t = new ChangeTracker();
        t.changeLine(3);
        t.removeLineFrom(3);

        assert.deepEqual(t.getChanges(), [
            {
                start: 3,
                end: 4,
                newStart: 3,
                newEnd: 3,
            },
        ]);

        t.changeLine(4);
        assert.deepEqual(t.getChanges(), [
            {
                start: 3,
                end: 4,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 5,
                end: 5,
                newStart: 4,
                newEnd: 4,
            },
        ]);

        t.addNewLineFrom(4);
        assert.deepEqual(t.getChanges(), [
            {
                start: 3,
                end: 4,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 5,
                end: 5,
                newStart: 4,
                newEnd: 5,
            },
        ]);

        t.addNewLineFrom(5);
        assert.deepEqual(t.getChanges(), [
            {
                start: 3,
                end: 4,
                newStart: 3,
                newEnd: 3,
            },
            {
                start: 5,
                end: 5,
                newStart: 4,
                newEnd: 6,
            },
        ]);
    });

    it("adding & removing & changing - 2", async () => {
        const t = new ChangeTracker();
        t.changeLine(3);
        t.changeLine(3);
        t.changeLine(3);
        t.changeLine(3);
        t.removeLineFrom(2);

        assert.deepEqual(t.getChanges(), [
            {
                start: 2,
                end: 3,
                newStart: 2,
                newEnd: 2,
            },
        ]);

        t.changeLine(4);
        t.changeLine(4);
        t.changeLine(4);
        t.changeLine(4);
        assert.deepEqual(t.getChanges(), [
            {
                start: 2,
                end: 3,
                newStart: 2,
                newEnd: 2,
            },
            {
                start: 5,
                end: 5,
                newStart: 4,
                newEnd: 4,
            },
        ]);

        t.addNewLineFrom(3);
        assert.deepEqual(t.getChanges(), [
            {
                start: 2,
                end: 3,
                newStart: 2,
                newEnd: 2,
            },
            {
                start: 4,
                end: 4,
                newStart: 3,
                newEnd: 4,
            },
            {
                start: 5,
                end: 5,
                newStart: 5,
                newEnd: 5,
            },
        ]);

        // t.addNewLineFrom(4);
        // assert.deepEqual(t.getChanges(), [
        //     {
        //         start: 3,
        //         end: 4,
        //         newStart: 3,
        //         newEnd: 3,
        //     },
        //     {
        //         start: 5,
        //         end: 5,
        //         newStart: 4,
        //         newEnd: 6,
        //     },
        // ]);
    });
});
