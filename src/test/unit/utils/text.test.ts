import { strict as assert } from "assert";

import { calculateEditorColFromVimScreenCol, expandTabs } from "../../../utils/text";

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

describe("calculateEditorColFromVimScreenCol", () => {
    [
        {
            testName: "start position is zero",
            screenCol: 0,
            expectedCol: 0,
        },
        {
            testName: "position in non-tabbed text is number of chars",
            screenCol: 2,
            expectedCol: 2,
        },
        {
            testName: "tab is worth the full tab width on a tab stop",
            screenCol: 8, // the "w" in "world"
            expectedCol: 5,
        },
        {
            testName: "tab width is offset when not on a final tabstop",
            screenCol: 16, // the first "!"
            expectedCol: 11,
        },
    ].forEach(({ testName, screenCol, expectedCol }) => {
        it(`reports positions in 'helo\tworld\t!!': ${testName}`, () => {
            const editorCol = calculateEditorColFromVimScreenCol("helo\tworld\t!!", screenCol, 4);
            assert.equal(editorCol, expectedCol);
        });
    });

    it("returns zero for an empty line", () => {
        const editorCol = calculateEditorColFromVimScreenCol("", 20, 4);
        assert.equal(editorCol, 0);
    });

    it("returns zero columns if the column is zero", () => {
        const editorCol = calculateEditorColFromVimScreenCol("hello world", 0, 4);
        assert.equal(editorCol, 0);
    });
});
