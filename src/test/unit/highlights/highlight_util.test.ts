import { strict as assert } from "assert";

import { expandTabs, getWidth, isDouble } from "../../../highlights/util";

describe("isDouble", () => {
    [
        {
            char: "a", // length 1
            expectedDouble: false,
        },
        {
            char: "₪", // length 1
            expectedDouble: false,
        },
        {
            char: "你", // length 1
            expectedDouble: true,
        },
        {
            char: "🚀", // length 2
            expectedDouble: true,
        },
        {
            char: "🕵️", // length 3
            expectedDouble: true,
        },
        {
            char: "❤️", // length 2
            expectedDouble: true,
        },
    ].forEach(({ char, expectedDouble }) => {
        it(`${expectedDouble ? "should" : "should not"} consider '${char}' to be double-width`, () => {
            assert.equal(isDouble(char), expectedDouble);
        });
    });
});

describe("getWidth", () => {
    [
        {
            testName: "normal ascii should have a width equal to the length",
            text: "hello world",
            expectedWidth: 11,
        },
        {
            testName: "double-wide chars should count twice in the length",
            text: "ship it 🚀🚀", // rockets are double-wide, so count twice
            expectedWidth: 12,
        },
        {
            testName: "tabs at the start of a line should count for their full tab width",
            text: "\treturn 0;",
            expectedWidth: 13,
        },
        {
            // see expandTabs for more tests like this
            testName: "tabs in the middle of a line should only count up to their next tabstop",
            text: "\treturn\t0;",
            expectedWidth: 14,
        },
    ].forEach(({ testName, text, expectedWidth }) => {
        it(testName, () => {
            assert.equal(getWidth(text, 4), expectedWidth);
        });
    });
});

describe("expandTabs", () => {
    [
        {
            testName: "normal string produces itself",
            line: "hello world",
            expected: "hello world",
        },
        {
            testName: "tab at start expands to full tab width",
            line: "\thello world",
            expected: "    hello world",
        },
        {
            testName: "tab at start expands to full tab width",
            line: "\thello world",
            expected: "    hello world",
        },
        {
            testName: "tab on a tab width offset is the full tab width",
            line: "heyo\tworld",
            expected: "heyo    world",
        },
        {
            testName: "tab is reduced by the number of spaces it's after a tab stop",
            line: "hello\tworld",
            expected: "hello   world",
        },
        {
            testName: "handles cases where tabs are only one wide",
            line: "hellllo\tworld",
            expected: "hellllo world",
        },
        {
            testName: "multiple tabs on a line should expand fully",
            line: "\thello\tworld\t!!!",
            expected: "    hello   world   !!!",
        },
    ].forEach(({ testName, line, expected }) => {
        it(testName, () => {
            assert.equal(expandTabs(line, 4), expected);
        });
    });
});
