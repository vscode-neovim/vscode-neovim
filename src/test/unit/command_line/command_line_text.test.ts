import { strict as assert } from "assert";

import { diffLineText } from "../../../command_line/command_line_text";

describe("calculateTextChange", () => {
    it("should return 'NoTextChange' when the text hasn't changed", () => {
        assert.deepEqual(diffLineText("hello", "hello"), { action: "none" });
    });

    it("should return 'added' when a character has been typed", () => {
        assert.deepEqual(diffLineText("worl", "world"), { action: "added", char: "d" });
    });

    it("should return 'removed' when a character has been deleted", () => {
        assert.deepEqual(diffLineText("world", "worl"), { action: "removed", char: "d" });
    });

    it("should return 'other' if a change is performed somewhere in the middle of the text", () => {
        assert.deepEqual(diffLineText("wrld", "wold"), { action: "other" });
    });
});
