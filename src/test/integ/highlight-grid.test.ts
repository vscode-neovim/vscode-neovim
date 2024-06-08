import { strict as assert } from "assert";

void assert;

import {
    HighlightGrid,
    HighlightRange,
    type Highlight,
    type HighlightGroupStore,
    type VimCell,
} from "../../highlights";

import { closeAllActiveEditors } from "./integrationUtils";

interface THighlightGrid {
    handleGridLine(line: number, vimCol: number, cells: VimCell[]): void;
    lineHighlightsToRanges(line: number, highlights: Map<number, Highlight[]>): HighlightRange[];
    getLineHighlights(line: number, lineText: string, tabSize: number): Map<number, Highlight[]>;
}

function sortRanges(ranges: HighlightRange[]) {
    ranges.sort((a, b) => {
        const aCol = a.textType === "normal" ? a.startCol : a.col;
        const bCol = b.textType === "normal" ? b.startCol : b.col;
        return a.line + aCol - (b.line + bCol);
    });
}

describe("HighlightGrid.getLineHighlights", function () {
    this.retries(0);
    this.afterEach(async () => {
        await closeAllActiveEditors();
    });

    const testCases = [
        {
            testName: "can highlight single-width text",
            events: [
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [["h", 1], ["e"], ["l"], ["l"], ["o"]],
                    lineText: "hello world",
                    tabSize: 4,
                },
                {
                    line: 1,
                    vimCol: 2,
                    vimCells: [["h", 2], ["e"], ["l"], ["l"], ["o"]],
                    lineText: "  hello world",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 1,
                    line: 0,
                    startCol: 0,
                    endCol: 5,
                },
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 1,
                    startCol: 2,
                    endCol: 7,
                },
            ],
        },
        {
            testName: "text after start-of-line tabs should have a startCol equal to the number of tabs",
            events: [
                {
                    line: 0,
                    // column 8 because we have two tabs, and our tab size is four
                    vimCol: 8,
                    vimCells: [["h", 2], ["e"], ["l"], ["l"], ["o"]],
                    lineText: "\t\thello world",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 0,
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
                    line: 0,
                    // column 12 because we have two tabs, the first one has width four, the text between them is width five,
                    // the second has width three (due to its position relative to the tabstop)
                    vimCol: 12,
                    vimCells: [["w", 2], ["o"], ["r"], ["l"], ["d"]],
                    lineText: "\thello\tworld",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 0,
                    startCol: 7,
                    endCol: 12,
                },
            ],
        },
        {
            testName: "searching for tabs should highlight their full width with a virtual highlight",
            events: [
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [
                        [" ", 0, 4],
                        ["h"],
                        ["e"],
                        ["l"],
                        ["l"],
                        ["o"],
                        [" "],
                        ["w"],
                        ["o"],
                        ["r"],
                        ["l"],
                        ["d"],
                    ],
                    lineText: "\thello\tworld",
                    tabSize: 4,
                },
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [[" ", 2, 4]],
                    lineText: "\thello\tworld",
                    tabSize: 4,
                },
                {
                    line: 0,
                    // column 9 because we have one tab, plus the text width of five
                    vimCol: 9,
                    vimCells: [[" ", 3, 3]],
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
                    line: 0,
                    col: 0,
                },
                {
                    textType: "virtual" as const,
                    highlights: [
                        { hlId: 3, text: " ", virtText: " " },
                        { hlId: 3, text: " ", virtText: " " },
                        { hlId: 3, text: " ", virtText: " " },
                    ],
                    line: 0,
                    col: 6,
                },
            ],
        },
        {
            testName: "searching for double-wide characters should include their full width in the output",
            events: [
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [["L", 0], ["e"], ["t"], ["'"], ["s"], [" "], ["s"]],
                    lineText: "Let's ship it 🚀",
                    tabSize: 4,
                },
                {
                    line: 0,
                    vimCol: 6,
                    vimCells: [["s", 2], ["h"], ["i"], ["p"], [" "], ["i"], ["t"], [" "], ["🚀"], [""]],
                    lineText: "Let's ship it 🚀",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 0,
                    startCol: 6,
                    endCol: 14,
                },
                // The rocket has a separate highlight range
                // TODO: should it?
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 0,
                    startCol: 15,
                    endCol: 16,
                },
            ],
        },
        {
            testName: "allows adding virtual text to the end of an empty line",
            events: [
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [["h", 2], ["e"], ["l"], ["l"], ["o"]],
                    lineText: "",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "hello", virtText: "hello" }],
                    line: 0,
                    col: 0,
                },
            ],
        },
        {
            testName: "allows adding virtual text with double-wide characters to the end of an empty line",
            events: [
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [["👋", 2], [""], ["h"], ["e"], ["l"], ["l"], ["o"]],
                    lineText: "",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "virtual" as const,
                    highlights: [{ text: "👋hello", hlId: 2, virtText: "👋hello" }],
                    line: 0,
                    col: 0,
                },
            ],
        },
        {
            testName: "allows overlaying virtual text on an existing line",
            events: [
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [["h", 2], ["e"], ["y"], ["!"], ["!"]],
                    lineText: "world",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "h", virtText: "h" }],
                    line: 0,
                    col: 0,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "e", virtText: "e" }],
                    line: 0,
                    col: 1,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "y", virtText: "y" }],
                    line: 0,
                    col: 2,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "!", virtText: "!" }],
                    line: 0,
                    col: 3,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "!", virtText: "!" }],
                    line: 0,
                    col: 4,
                },
            ],
        },
        {
            testName: "allows overlaying virtual text on an existing line with double-wide characters",
            events: [
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [["h", 2], ["e"], ["y"], ["!"], ["!"]],
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
                    line: 0,
                    col: 1,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "y", virtText: "y" }],
                    line: 0,
                    col: 2,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "!", virtText: "!" }],
                    line: 0,
                    col: 3,
                },
                {
                    textType: "virtual" as const,
                    highlights: [{ hlId: 2, text: "!", virtText: "!" }],
                    line: 0,
                    col: 4,
                },
            ],
        },
        {
            testName:
                "allows overlaying virtual text over double-wide chars with an early end by adding an extra space",
            events: [
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [["h", 2]],
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
                    line: 0,
                    col: 1,
                },
            ],
        },
        {
            testName: "redrawing a virtual highlight over a double-wide character redraws both cells",
            events: [
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [["a", 2], ["1"]],
                    lineText: "你",
                    tabSize: 4,
                },
                {
                    line: 0,
                    vimCol: 1,
                    vimCells: [["2", 2]],
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
                    line: 0,
                    col: 0,
                },
            ],
        },
        {
            testName: "two highlights on the same line and same hlId should produce two ranges",
            events: [
                {
                    line: 0,
                    vimCol: 0,
                    vimCells: [["h", 2], ["e"], ["l"], ["l"], ["o"]],
                    lineText: "hello world hello",
                    tabSize: 4,
                },
                {
                    line: 0,
                    vimCol: 12,
                    vimCells: [["h", 2], ["e"], ["l"], ["l"], ["o"]],
                    lineText: "hello world hello",
                    tabSize: 4,
                },
            ],
            expectedRanges: [
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 0,
                    startCol: 0,
                    endCol: 5,
                },
                {
                    textType: "normal" as const,
                    hlId: 2,
                    line: 0,
                    startCol: 12,
                    endCol: 17,
                },
            ],
        },
    ] as {
        testName: string;
        events: {
            line: number;
            vimCol: number;
            vimCells: VimCell[];
            lineText: string;
            tabSize: number;
        }[];
        expectedRanges: HighlightRange[];
    }[];

    testCases.forEach(({ testName, events, expectedRanges }) => {
        if (testName !== "allows overlaying virtual text on an existing line") return;
        it(testName, () => {
            const grid = new HighlightGrid(
                // fake the group store, only for testing
                { normalizeHighlightId: (hlId) => hlId } as HighlightGroupStore,
            ) as any as THighlightGrid;

            const lineRanges = new Map<number, HighlightRange[]>();
            events.forEach(({ line, vimCol, vimCells, lineText, tabSize }) => {
                grid.handleGridLine(line, vimCol, vimCells);
                const highlights = grid.getLineHighlights(line, lineText, tabSize);
                const ranges = grid.lineHighlightsToRanges(line, highlights).filter((range) => {
                    if (range.textType === "normal") return range.hlId !== 0;
                    return range.highlights.some((highlight) => highlight.hlId !== 0);
                });
                lineRanges.set(line, ranges);
            });

            const allRanges = Array.from(lineRanges.values()).flat();

            sortRanges(allRanges);
            assert.deepEqual(allRanges, expectedRanges);
        });
    });
});
