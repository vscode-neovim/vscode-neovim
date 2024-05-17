import { strict as assert } from "assert";

import { commandInputIsCompletable, diffLineText } from "../../../command_line/command_line_text";

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

describe("commandInputIsCompletable", () => {
    [
        "substitute/blah",
        "substitute/",
        "s/blah",
        "s/",
        "g/blah",
        "global/",
        "v/",
        "v/blah",
        "vglobal/",
        "vglobal/blah",
    ].forEach((input) => {
        it(`should not produce completions for user-input commands: '${input}'`, () => {
            assert.equal(commandInputIsCompletable(input), false);
        });
    });

    ["p", "Ins", "nno"].forEach((input) => {
        it(`should produce completions for normal commands: '${input}'`, () => {
            assert.equal(commandInputIsCompletable(input), true);
        });
    });
});
