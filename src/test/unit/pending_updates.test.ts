import { strict as assert } from "assert";

import { PendingUpdates } from "../../pending_updates";

describe("PendingUpdates", () => {
    it("size should be zero on initialization", () => {
        const updates = new PendingUpdates<string>();
        assert.equal(updates.size(), 0);
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
});
