import { strict as assert } from "assert";

import { expandTabs } from "../../../utils/text";

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
