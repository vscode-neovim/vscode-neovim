import { cloneDeep, findLast } from "lodash";

import { Highlight, HighlightRange, LineCell, NormalHighlightRange, VimCell, VirtualHighlightRange } from "./types";
import { CellIter, getWidth, isDouble, splitGraphemes } from "./util";

/**
 * A class to manage the grid lines of a grid.
 * Handle the grid_line event and be responsible for computing the highlight ranges.
 */
export class GridLine {
    // line number -> line cells
    private lineCells: LineCell[][] = [];

    handleGridLine(line: number, vimCol: number, cells: VimCell[]) {
        const prevCells = this.lineCells[line] ?? [];
        // Fill in the missing cells
        if (prevCells.length < vimCol) {
            const missingCells = vimCol - prevCells.length;
            for (let i = 0; i < missingCells; i++) {
                prevCells.push({ text: " ", hlId: 0 });
            }
        }

        const redrawCells: LineCell[] = [];
        {
            let currHlId = 0;
            for (const [text, hlId, repeat] of cells) {
                if (hlId != null) currHlId = hlId;
                for (let i = 0; i < (repeat ?? 1); i++) {
                    redrawCells.push({ text, hlId: currHlId });
                }
            }
        }
        const leftCells = prevCells.slice(0, vimCol);
        const rightCells = prevCells.slice(vimCol + redrawCells.length);

        this.lineCells[line] = [...leftCells, ...redrawCells, ...rightCells];
    }

    lineHighlightsToRanges(line: number, highlights: Map<number, Highlight[]>): HighlightRange[] {
        const normalHighlights: Map<number, NormalHighlightRange[]> = new Map();
        const virtualHighlights: VirtualHighlightRange[] = [];
        highlights.forEach((hls, col) => {
            if (hls.length === 0) {
                // Should never happen, but defensive
                return;
            }

            if (hls.length > 1 || hls[0].virtText) {
                virtualHighlights.push({
                    textType: "virtual",
                    highlights: hls,
                    line,
                    col,
                });
                return;
            }

            const colHighlight = hls[0];
            const existingHighlights = normalHighlights.get(colHighlight.hlId) ?? [];
            const matchingHighlight = findLast(existingHighlights, (hl) => hl.endCol === col);

            if (matchingHighlight) {
                // Extend our existing highlight if we already have it
                matchingHighlight.endCol = col + 1;
            } else {
                const highlight = {
                    textType: "normal" as const,
                    hlId: colHighlight.hlId,
                    line,
                    startCol: col,
                    endCol: col + 1,
                };
                existingHighlights.push(highlight);
            }

            normalHighlights.set(colHighlight.hlId, existingHighlights);
        });

        const ranges: HighlightRange[] = Array.from(normalHighlights.values()).flat();
        ranges.push(...virtualHighlights);

        return ranges;
    }

    // char col -> highlights
    computeLineHighlights(line: number, lineText: string, tabSize: number): Map<number, Highlight[]> {
        const lineCells = cloneDeep(this.lineCells[line] ?? []);
        if (!lineCells.length) return new Map();

        const highlights: Map<number, Highlight[]> = new Map();

        const cells: LineCell[] = [];
        // EOL highlights are all virtual text highlights
        // For performance, we need to combine EOL cells that have the same hlId
        {
            const idealMaxCells = getWidth(lineText, tabSize);
            cells.push(...lineCells.slice(0, idealMaxCells));

            const eolCells: LineCell[] = [];
            let hlId = 0;
            for (const cell of lineCells.slice(idealMaxCells)) {
                if (cell.hlId === hlId && eolCells.length) {
                    eolCells[eolCells.length - 1].text += cell.text;
                } else {
                    eolCells.push(cell);
                }
                hlId = cell.hlId;
            }

            cells.push(...eolCells);
        }
        const cellIter = new CellIter(cells);
        const lineChars = splitGraphemes(lineText);
        // Insert additional columns for characters with length greater than 1.
        const filledLineText = splitGraphemes(lineText).reduce((p, c) => p + c + " ".repeat(c.length - 1), "");
        const filledLineChars = splitGraphemes(filledLineText);
        // Calculates the number of spaces occupied by the tab
        const calcTabCells = (tabCol: number) => {
            let nearestTabIdx = lineChars.slice(0, tabCol).lastIndexOf("\t");
            nearestTabIdx = nearestTabIdx === -1 ? 0 : nearestTabIdx + 1;
            const center = lineChars.slice(nearestTabIdx, tabCol).join("");
            return tabSize - (getWidth(center, tabSize) % tabSize);
        };

        // Always redraw the entire line :)
        let currCharCol = 0;
        let cell = cellIter.takeNext();
        while (cell) {
            const hls: Highlight[] = [];
            const add = (cell: LineCell, virtText?: string) => hls.push({ ...cell, virtText });
            const currChar = filledLineChars[currCharCol];
            const extraCols = currChar ? currChar.length - 1 : 0;
            currCharCol += extraCols;
            // ... some emojis have text versions e.g. [..."❤️"] == ['❤', '️']
            const hlCol = currCharCol - (currChar ? [...currChar].length - 1 : 0);

            do {
                if (currChar === "\t") {
                    add(cell, cell.text);
                    for (let i = 0; i < calcTabCells(currCharCol) - 1; i++) {
                        cell = cellIter.takeNext();
                        cell && add(cell, cell.text);
                    }

                    break;
                }

                if (currChar && isDouble(currChar)) {
                    if (currChar === cell.text) {
                        add(cell);
                        cellIter.discardNext();
                        break;
                    }

                    add(cell, cell.text);
                    if (!isDouble(cell.text)) {
                        const nextCell = cellIter.takeNext();
                        nextCell && add(nextCell, nextCell.text);
                        extraCols && add(nextCell ?? cell, " ".repeat(extraCols));
                    }

                    break;
                }

                if (currChar === cell.text) {
                    add(cell);
                } else {
                    add(cell, cell.text);
                    if (isDouble(cell.text)) {
                        currCharCol++;
                    }
                }

                // eslint-disable-next-line no-constant-condition
            } while (false);

            highlights.set(hlCol, hls);

            /////////////////////////////////////////////
            currCharCol++;
            cell = cellIter.takeNext();
        }

        return highlights;
    }
}
