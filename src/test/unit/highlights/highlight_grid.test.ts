import { strict as assert } from "assert";

import { HighlightCellsEvent, HighlightGrid, HighlightRange } from "../../../highlights/highlight_grid";

function sortRanges(ranges: HighlightRange[]) {
    ranges.sort((a, b) => {
        const aCol = a.textType === "normal" ? a.startCol : a.col;
        const bCol = b.textType === "normal" ? b.startCol : b.col;

        return a.line + aCol - (b.line + bCol);
    });
}

describe("processHighlightCellsEvent", () => {
    [
        {
            testName: "can highlight single-width text",
            events: [
                {
                    row: 2,
                    vimCol: 0,
                    validCells: [
                        { hlId: 1, text: "h" },
                        { hlId: 1, text: "e" },
                        { hlId: 1, text: "l" },
                        { hlId: 1, text: "l" },
                        { hlId: 1, text: "o" },
                    ],
                    lineText: "hello world",
                    tabSize: 4,
                },
                {
                    row: 3,
                    vimCol: 2,
                    validCells: [
                        { hlId: 2, text: "h" },
                        { hlId: 2, text: "e" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "o" },
                    ],
                    lineText: "> hello world",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 1,
                    line: 12,
                    startCol: 0,
                    endCol: 5,
                },
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 13,
                    startCol: 2,
                    endCol: 7,
                },
            ],
        },
        {
            testName: "text after start-of-line tabs should have a startCol equal to the number of tabs",
            events: [
                {
                    row: 2,
                    // column 8 because we have two tabs, and our tab size is four
                    vimCol: 8,
                    validCells: [
                        { hlId: 2, text: "h" },
                        { hlId: 2, text: "e" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "o" },
                    ],
                    lineText: "\t\thello world",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 12,
                    startCol: 2,
                    endCol: 7,
                },
            ],
        },
        {
            testName:
                "text after middle-of-line tabs should have a startCol equal to the number of tabs plus the intermediate text width",
            events: [
                {
                    row: 2,
                    // column 12 because we have two tabs, the first one has width four, the text between them is width five,
                    // the second has width three (due to its position relative to the tabstop)
                    vimCol: 12,
                    validCells: [
                        { hlId: 2, text: "w" },
                        { hlId: 2, text: "o" },
                        { hlId: 2, text: "r" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "d" },
                    ],
                    lineText: "\thello\tworld",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 12,
                    startCol: 7,
                    endCol: 12,
                },
            ],
        },
        {
            testName: "searching for tabs should highlight their full width with a virtual highlight",
            events: [
                {
                    row: 2,
                    vimCol: 0,
                    validCells: [
                        { hlId: 2, text: " " },
                        { hlId: 2, text: " " },
                        { hlId: 2, text: " " },
                        { hlId: 2, text: " " },
                    ],
                    lineText: "\thello\tworld",
                    tabSize: 4,
                },
                {
                    row: 2,
                    // column 9 because we have one tab, plus the text width of five
                    vimCol: 9,
                    validCells: [
                        { hlId: 3, text: " " },
                        { hlId: 3, text: " " },
                        { hlId: 3, text: " " },
                    ],
                    lineText: "\thello\tworld",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "virtual" as const,
                    highlights: [
                        { hlId: 2, text: " ", virtText: " " },
                        { hlId: 2, text: " ", virtText: " " },
                        { hlId: 2, text: " ", virtText: " " },
                        { hlId: 2, text: " ", virtText: " " },
                    ],
                    line: 12,
                    col: 0,
                },
                {
                    textType: "virtual" as const,
                    highlights: [
                        { hlId: 3, text: " ", virtText: " " },
                        { hlId: 3, text: " ", virtText: " " },
                        { hlId: 3, text: " ", virtText: " " },
                    ],
                    line: 12,
                    col: 6,
                },
            ],
        },
        {
            testName: "searching for double-wide characters should include their full width in the output",
            events: [
                {
                    row: 2,
                    vimCol: 6,
                    validCells: [
                        { hlId: 2, text: "s" },
                        { hlId: 2, text: "h" },
                        { hlId: 2, text: "i" },
                        { hlId: 2, text: "p" },
                        { hlId: 2, text: " " },
                        { hlId: 2, text: "i" },
                        { hlId: 2, text: "t" },
                        { hlId: 2, text: " " },
                        { hlId: 2, text: "🚀" },
                    ],
                    lineText: "Let's ship it 🚀",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 12,
                    startCol: 6,
                    endCol: 14,
                },
                // The rocket has a separate highlight range
                // TODO: should it?
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 12,
                    startCol: 15,
                    endCol: 16,
                },
            ],
        },
        {
            testName: "removes highlights when they are reassigned to hl group zero",
            events: [
                {
                    row: 2,
                    vimCol: 6,
                    validCells: [
                        { hlId: 2, text: "w" },
                        { hlId: 2, text: "o" },
                        { hlId: 2, text: "r" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "d" },
                    ],
                    lineText: "hello world",
                    tabSize: 4,
                },
                {
                    row: 2,
                    vimCol: 6,
                    validCells: [
                        { hlId: 0, text: "w" },
                        { hlId: 0, text: "o" },
                        { hlId: 0, text: "r" },
                        { hlId: 0, text: "l" },
                        { hlId: 0, text: "d" },
                    ],
                    lineText: "hello world",
                    tabSize: 4,
                },
            ],
            expectedRanges: [],
        },
        {
            testName: "removes highlights when part of the selection is reassigned to hl group zero",
            events: [
                {
                    row: 2,
                    vimCol: 6,
                    validCells: [
                        { hlId: 2, text: "w" },
                        { hlId: 2, text: "o" },
                        { hlId: 2, text: "r" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "d" },
                    ],
                    lineText: "hello world",
                    tabSize: 4,
                },
                {
                    row: 2,
                    vimCol: 6,
                    validCells: [
                        { hlId: 0, text: "w" },
                        { hlId: 0, text: "o" },
                        { hlId: 0, text: "r" },
                        // l and d are kept
                    ],
                    lineText: "hello world",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 12,
                    startCol: 9,
                    endCol: 11,
                },
            ],
        },
        {
            testName: "removes highlights from deleted characters",
            events: [
                {
                    row: 2,
                    vimCol: 6,
                    validCells: [
                        { hlId: 2, text: "w" },
                        { hlId: 2, text: "o" },
                        { hlId: 2, text: "r" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "d" },
                    ],
                    lineText: "hello world",
                    tabSize: 4,
                },
                {
                    row: 2,
                    vimCol: 6,
                    validCells: [
                        { hlId: 2, text: "o" },
                        { hlId: 2, text: "r" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "d" },
                    ],
                    lineText: "hello orld",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 12,
                    startCol: 6,
                    endCol: 11,
                },
            ],
        },
        {
            testName: "allows adding virtual text to the end of an empty line",
            events: [
                {
                    row: 2,
                    vimCol: 0,
                    validCells: [
                        { hlId: 2, text: "h" },
                        { hlId: 2, text: "e" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "o" },
                    ],
                    lineText: "",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "h", virtText: "h" }],
                    line: 12,
                    col: 0,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "e", virtText: "e" }],
                    line: 12,
                    col: 1,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "l", virtText: "l" }],
                    line: 12,
                    col: 2,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "l", virtText: "l" }],
                    line: 12,
                    col: 3,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "o", virtText: "o" }],
                    line: 12,
                    col: 4,
                },
            ],
        },
        {
            testName: "allows adding virtual text with double-wide characters to the end of an empty line",
            events: [
                {
                    row: 2,
                    vimCol: 0,
                    validCells: [
                        { hlId: 2, text: "👋" },
                        { hlId: 2, text: "h" },
                        { hlId: 2, text: "e" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "o" },
                    ],
                    lineText: "",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "👋", virtText: "👋" }],
                    line: 12,
                    col: 0,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "h", virtText: "h" }],
                    line: 12,
                    col: 2,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "e", virtText: "e" }],
                    line: 12,
                    col: 3,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "l", virtText: "l" }],
                    line: 12,
                    col: 4,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "l", virtText: "l" }],
                    line: 12,
                    col: 5,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "o", virtText: "o" }],
                    line: 12,
                    col: 6,
                },
            ],
        },
        {
            testName: "allows overlaying virtual text on an existing line",
            events: [
                {
                    row: 2,
                    vimCol: 0,
                    validCells: [
                        { hlId: 2, text: "h" },
                        { hlId: 2, text: "e" },
                        { hlId: 2, text: "y" },
                        { hlId: 2, text: "!" },
                        { hlId: 2, text: "!" },
                    ],
                    lineText: "world",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "h", virtText: "h" }],
                    line: 12,
                    col: 0,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "e", virtText: "e" }],
                    line: 12,
                    col: 1,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "y", virtText: "y" }],
                    line: 12,
                    col: 2,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "!", virtText: "!" }],
                    line: 12,
                    col: 3,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "!", virtText: "!" }],
                    line: 12,
                    col: 4,
                },
            ],
        },
        {
            testName: "allows overlaying virtual text on an existing line with double-wide characters",
            events: [
                {
                    row: 2,
                    vimCol: 0,
                    validCells: [
                        { hlId: 2, text: "h" },
                        { hlId: 2, text: "e" },
                        { hlId: 2, text: "y" },
                        { hlId: 2, text: "!" },
                        { hlId: 2, text: "!" },
                    ],
                    lineText: "👋 yo",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "virtual" as const,
                    highlights: [
                        { hlId: 2, text: "h", virtText: "h" },
                        { hlId: 2, text: "e", virtText: "e" },
                        // TODO: why is e repeated? Something to do with the double-wide char...
                        { hlId: 2, text: "e", virtText: " " },
                    ],
                    line: 12,
                    col: 1,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "y", virtText: "y" }],
                    line: 12,
                    col: 2,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "!", virtText: "!" }],
                    line: 12,
                    col: 3,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "!", virtText: "!" }],
                    line: 12,
                    col: 4,
                },
            ],
        },
        {
            testName:
                "allows overlaying virtual text over double-wide chars with an early end by adding an extra space",
            events: [
                {
                    row: 2,
                    vimCol: 0,
                    validCells: [{ hlId: 2, text: "h" }],
                    lineText: "👋",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "virtual" as const,
                    highlights: [
                        { hlId: 2, text: "h", virtText: "h" },
                        { hlId: 2, text: "h", virtText: " " },
                    ],
                    line: 12,
                    col: 1,
                },
            ],
        },
        {
            testName: "redrawing a virtual highlight over a double-wide character redraws both cells",
            events: [
                {
                    row: 2,
                    vimCol: 0,
                    validCells: [
                        { hlId: 2, text: "a" },
                        { hlId: 2, text: "1" },
                    ],
                    lineText: "你",
                    tabSize: 4,
                },
                {
                    row: 2,
                    vimCol: 1,
                    validCells: [{ hlId: 2, text: "2" }],
                    lineText: "你",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "virtual" as const,
                    highlights: [
                        { hlId: 2, text: "a", virtText: "a" },
                        { hlId: 2, text: "2", virtText: "2" },
                    ],
                    line: 12,
                    col: 0,
                },
            ],
        },
    ].forEach(
        ({
            testName,
            events,
            expectedRanges,
        }: {
            testName: string;
            events: HighlightCellsEvent[];
            expectedRanges: HighlightRange[];
        }) => {
            it(testName, () => {
                const grid = new HighlightGrid();
                events.forEach((event) => {
                    const updated = grid.processHighlightCellsEvent(event);
                    assert.equal(true, updated);
                });

                // 10 is arbitrary, it's just to demonstrate that this offset works as expected
                const ranges = grid.buildHighlightRanges(10);
                sortRanges(ranges);

                assert.deepEqual(ranges, expectedRanges);
            });
        },
    );

    it("returns false when no update is applied", () => {
        const grid = new HighlightGrid();
        // Deselect something that was never highlighted
        const updated = grid.processHighlightCellsEvent({
            row: 2,
            vimCol: 0,
            validCells: [
                { hlId: 0, text: "h" },
                { hlId: 0, text: "e" },
                { hlId: 0, text: "l" },
                { hlId: 0, text: "l" },
                { hlId: 0, text: "o" },
            ],
            lineText: "hello world",
            tabSize: 4,
        });

        assert.equal(updated, false);
    });
});

describe("cleanRow", () => {
    it("clears selected lines from the highlighted ranges", () => {
        const grid = new HighlightGrid();

        for (let row = 1; row <= 5; row++) {
            grid.processHighlightCellsEvent({
                row,
                vimCol: 0,
                validCells: [
                    { hlId: row, text: "h" },
                    { hlId: row, text: "e" },
                    { hlId: row, text: "l" },
                    { hlId: row, text: "l" },
                    { hlId: row, text: "o" },
                ],
                lineText: "hello world",
                tabSize: 4,
            });
        }

        grid.cleanRow(2);
        grid.cleanRow(4);

        const ranges = grid.buildHighlightRanges(0);
        sortRanges(ranges);

        assert.deepEqual(ranges, [
            {
                textType: "normal",
                hlId: 1,
                line: 1,
                startCol: 0,
                endCol: 5,
            },
            {
                textType: "normal",
                hlId: 3,
                line: 3,
                startCol: 0,
                endCol: 5,
            },
            {
                textType: "normal",
                hlId: 5,
                line: 5,
                startCol: 0,
                endCol: 5,
            },
        ]);
    });
});

describe("shiftHighlights", () => {
    [
        {
            testName: "should no nothing when scrolling by zero",
            scrollAmount: 0,
            scrollFrom: 0,
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 4,
                    startCol: 1,
                    endCol: 6,
                },
                {
                    textType: "normal" as const,
                    hlId: 3,
                    line: 6,
                    startCol: 0,
                    endCol: 5,
                },
                {
                    textType: "normal" as const,
                    hlId: 4,
                    line: 7,
                    startCol: 2,
                    endCol: 4,
                },
            ],
        },
        {
            testName: "should shift items up by the scroll amount",
            scrollAmount: 2,
            scrollFrom: 0,
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    // 4 -> 2
                    line: 2,
                    startCol: 1,
                    endCol: 6,
                },
                {
                    textType: "normal" as const,
                    hlId: 3,
                    // 6 -> 4
                    line: 4,
                    startCol: 0,
                    endCol: 5,
                },
                {
                    textType: "normal" as const,
                    hlId: 4,
                    // 7 -> 5
                    line: 5,
                    startCol: 2,
                    endCol: 4,
                },
            ],
        },
        {
            testName: "should shift items down by the scroll amount",
            scrollAmount: -2,
            scrollFrom: 2,
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    // 4 -> 6
                    line: 6,
                    startCol: 1,
                    endCol: 6,
                },
                {
                    textType: "normal" as const,
                    hlId: 3,
                    // 6 -> 8
                    line: 8,
                    startCol: 0,
                    endCol: 5,
                },
                {
                    textType: "normal" as const,
                    hlId: 4,
                    // 7 -> 9
                    line: 9,
                    startCol: 2,
                    endCol: 4,
                },
            ],
        },
        {
            testName: "should clip out of bounds items when scrolling up",
            scrollAmount: 5,
            scrollFrom: 0,
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 3,
                    // 6 -> 1
                    line: 1,
                    startCol: 0,
                    endCol: 5,
                },
                {
                    textType: "normal" as const,
                    hlId: 4,
                    // 7 -> 2
                    line: 2,
                    startCol: 2,
                    endCol: 4,
                },
            ],
        },
        {
            testName: "should clip out of bounds items when scrolling down",
            scrollAmount: -5,
            scrollFrom: 1,
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 3,
                    // 6 -> 11
                    line: 11,
                    startCol: 0,
                    endCol: 5,
                },
                {
                    textType: "normal" as const,
                    hlId: 4,
                    // 7 -> 12
                    line: 12,
                    startCol: 2,
                    endCol: 4,
                },
            ],
        },
        {
            testName: "should clip out of bounds items when scrolling down when scrolling down from position zero",
            scrollAmount: -3,
            scrollFrom: 0,
            expectedRanges: [
                // This is based on the number of rows we already have highlighted,
                // so we remove anything 3 above original line 7
                {
                    textType: "normal" as const,
                    hlId: 2,
                    // 4 -> 7
                    line: 7,
                    startCol: 1,
                    endCol: 6,
                },
            ],
        },
        {
            testName: "should not alter highlight ranges that are out of scope of the scroll up event",
            scrollAmount: 1,
            scrollFrom: 100,
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 4,
                    startCol: 1,
                    endCol: 6,
                },
                {
                    textType: "normal" as const,
                    hlId: 3,
                    line: 6,
                    startCol: 0,
                    endCol: 5,
                },
                {
                    textType: "normal" as const,
                    hlId: 4,
                    line: 7,
                    startCol: 2,
                    endCol: 4,
                },
            ],
        },
        {
            testName: "should not alter highlight ranges that are out of scope of the scroll down event",
            scrollAmount: -1,
            scrollFrom: 100,
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 4,
                    startCol: 1,
                    endCol: 6,
                },
                {
                    textType: "normal" as const,
                    hlId: 3,
                    line: 6,
                    startCol: 0,
                    endCol: 5,
                },
                {
                    textType: "normal" as const,
                    hlId: 4,
                    line: 7,
                    startCol: 2,
                    endCol: 4,
                },
            ],
        },
    ].forEach(
        ({
            testName,
            scrollAmount,
            scrollFrom,
            expectedRanges,
        }: {
            testName: string;
            scrollAmount: number;
            expectedRanges: HighlightRange[];
            scrollFrom: number;
        }) => {
            it(testName, () => {
                const grid = new HighlightGrid();

                grid.processHighlightCellsEvent({
                    row: 4,
                    vimCol: 4,
                    validCells: [
                        { hlId: 2, text: "h" },
                        { hlId: 2, text: "e" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "l" },
                        { hlId: 2, text: "o" },
                    ],
                    lineText: "\thello,",
                    tabSize: 4,
                });

                grid.processHighlightCellsEvent({
                    row: 6,
                    vimCol: 0,
                    validCells: [
                        { hlId: 3, text: "w" },
                        { hlId: 3, text: "o" },
                        { hlId: 3, text: "r" },
                        { hlId: 3, text: "l" },
                        { hlId: 3, text: "d" },
                    ],
                    lineText: "world",
                    tabSize: 4,
                });
                grid.processHighlightCellsEvent({
                    row: 7,
                    vimCol: 8,
                    validCells: [
                        { hlId: 4, text: "!" },
                        { hlId: 4, text: "!" },
                    ],
                    lineText: "\t\t!!",
                    tabSize: 4,
                });

                grid.shiftHighlights(scrollAmount, scrollFrom);
                const ranges = grid.buildHighlightRanges(0);
                sortRanges(ranges);

                assert.deepEqual(ranges, expectedRanges);
            });
        },
    );
});

describe("maxColInRow", () => {
    it("should return zero for an empty row", () => {
        const grid = new HighlightGrid();
        assert.equal(grid.maxColInRow(2), 0);
    });

    it("should return the last column of the last highlight in the given row for an empty row", () => {
        const grid = new HighlightGrid();
        grid.processHighlightCellsEvent({
            row: 4,
            vimCol: 0,
            validCells: [
                { hlId: 2, text: "h" },
                { hlId: 2, text: "e" },
                { hlId: 2, text: "l" },
                { hlId: 2, text: "l" },
                { hlId: 2, text: "o" },
            ],
            lineText: "hello hello!",
            tabSize: 4,
        });

        grid.processHighlightCellsEvent({
            row: 4,
            vimCol: 6,
            validCells: [
                { hlId: 3, text: "h" },
                { hlId: 3, text: "e" },
                { hlId: 3, text: "l" },
                { hlId: 3, text: "l" },
                { hlId: 3, text: "o" },
            ],
            lineText: "hello hello!",
            tabSize: 4,
        });

        assert.equal(grid.maxColInRow(4), 10);
    });
});
