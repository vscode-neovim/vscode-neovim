import { strict as assert } from "assert";

import { PendingUpdates } from "../../utils/pending_updates";

describe("PendingUpdates", () => {
    it("size should be zero on initialization", () => {
        const updates = new PendingUpdates<string>();
        assert.equal(updates.size(), 0);
    });

    it("should be empty on initialization", () => {
        const updates = new PendingUpdates<string>();
        assert.equal(updates.empty(), true);
    });

    it("should not be empty when a resource is added", () => {
        const updates = new PendingUpdates<string>();
        updates.addConditionalUpdate("resource1", () => false);

        assert.equal(updates.empty(), false);
    });

    it("should be empty after clearing", () => {
        const updates = new PendingUpdates<string>();
        updates.addConditionalUpdate("resource1", () => false);
        updates.clear();

        assert.equal(updates.empty(), true);
    });

    it("size should increase by one for every unique resource", () => {
        const updates = new PendingUpdates<string>();
        updates.addConditionalUpdate("resource1", () => false);
        updates.addConditionalUpdate("resource1", () => false);
        updates.addConditionalUpdate("resource2", () => false);

        assert.equal(updates.size(), 2);
    });

    it("entries return a function for each key that evaluates all updates", () => {
        const updates = new PendingUpdates<string>();
        const evaluated: number[] = [];
        const makeUpdateFunc = (id: number, returnVal: boolean) => () => {
            evaluated.push(id);
            return returnVal;
        };

        updates.addConditionalUpdate("resource1", makeUpdateFunc(0, true));
        updates.addConditionalUpdate("resource1", makeUpdateFunc(1, true));
        updates.addConditionalUpdate("resource2", makeUpdateFunc(2, false));

        const entries = Object.fromEntries(updates.entries());
        assert.equal(entries["resource1"](), true);
        assert.equal(entries["resource2"](), false);

        evaluated.sort();
        assert.deepEqual(evaluated, [0, 1, 2]);
    });

    it("entries return a function for each key that evaluates all updates, even if one is a force update", () => {
        const updates = new PendingUpdates<string>();
        const evaluated: number[] = [];
        const makeUpdateFunc = (id: number, returnVal: boolean) => () => {
            evaluated.push(id);
            return returnVal;
        };

        updates.addForceUpdate("resource1");
        updates.addConditionalUpdate("resource1", makeUpdateFunc(0, false));
        updates.addConditionalUpdate("resource2", makeUpdateFunc(1, false));

        const entries = Object.fromEntries(updates.entries());
        assert.equal(entries["resource1"](), true);
        assert.equal(entries["resource2"](), false);

        evaluated.sort();
        assert.deepEqual(evaluated, [0, 1]);
    });

    it("force updates should always result in an entry that returns true", () => {
        const updates = new PendingUpdates<string>();
        updates.addForceUpdate("alreadyUpdated");

        const entries = Object.fromEntries(updates.entries());
        assert.equal(entries["alreadyUpdated"](), true);
    });

    it("should not execute any update function that has been cleared", () => {
        const updates = new PendingUpdates<string>();
        updates.addConditionalUpdate("resource1", () => {
            assert.fail("This should never happen");
        });
        updates.clear();

        assert.equal(updates.entries().length, 0);
    });
});
