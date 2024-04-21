import wcswidth from "ts-wcwidth";
import GraphemeSplitter from "grapheme-splitter";

import { calculateEditorColFromVimScreenCol, expandTabs } from "./utils";

export interface ValidCell {
    text: string;
    hlId: number;
}

export interface Highlight extends ValidCell {
    virtText?: string;
}

export interface HighlightCellsEvent {
    row: number;
    vimCol: number;
    validCells: ValidCell[];
    lineText: string;
    tabSize: number;
}

export class HighlightGrid {
    /**
     * a three-dimensional array representing rows and columns.
     * Each column can contain multiple highlights. e.g. double-width character, tab
     */
    private grid: Highlight[][][];

    constructor() {
        this.grid = [];
    }

    cleanRow(row: number) {
        delete this.grid[row];
    }

    processHighlightCellsEvent({ row, vimCol, validCells, lineText, tabSize }: HighlightCellsEvent): boolean {
        let hasUpdates = false;

        if (!this.grid[row]) {
            this.grid[row] = [];
        }

        const gridRow = this.grid[row];
        const getWidth = (text?: string) => {
            const t = expandTabs(text ?? "", tabSize);
            return segment(t).reduce((p, c) => p + (isDouble(c) ? 2 : 1), 0);
        };

        const lineChars = segment(lineText);

        // Calculates the number of spaces occupied by the tab
        const calcTabCells = (tabCol: number) => {
            let nearestTabIdx = lineChars.slice(0, tabCol).lastIndexOf("\t");
            nearestTabIdx = nearestTabIdx === -1 ? 0 : nearestTabIdx + 1;
            const center = lineChars.slice(nearestTabIdx, tabCol).join("");
            return tabSize - (getWidth(center) % tabSize);
        };

        const editorCol = calculateEditorColFromVimScreenCol(lineText, vimCol, tabSize);
        const cellIter = new CellIter(validCells);

        // #region
        // If the previous column can contain multiple cells,
        // then the redraw cells may contain cells from the previous column.
        if (editorCol > 0) {
            const prevCol = editorCol - 1;
            const prevChar = lineChars[prevCol];
            const expectedCells = prevChar === "\t" ? calcTabCells(prevCol) : getWidth(prevChar);
            if (expectedCells > 1) {
                const expectedVimCol = getWidth(lineChars.slice(0, editorCol).join(""));
                if (expectedVimCol > vimCol) {
                    const rightHls: Highlight[] = [];
                    for (let i = 0; i < expectedVimCol - vimCol; i++) {
                        const cell = cellIter.next();
                        cell && rightHls.push({ ...cell, virtText: cell.text });
                    }
                    const leftHls: Highlight[] = [];
                    if (expectedCells - rightHls.length) {
                        leftHls.push(...(gridRow[prevCol] ?? []).slice(0, expectedCells - rightHls.length));
                    }
                    gridRow[prevCol] = [...leftHls, ...rightHls];
                }
            }
        }
        // #endregion

        // Insert additional columns for characters with length greater than 1.
        const filledLineText = segment(lineText).reduce((p, c) => p + c + " ".repeat(c.length - 1), "");

        const filledLineChars = segment(filledLineText);
        let currCharCol = editorCol;
        let cell = cellIter.next();
        while (cell) {
            const hls: Highlight[] = [];
            const add = (cell: ValidCell, virtText?: string) => hls.push({ ...cell, virtText });
            const currChar = filledLineChars[currCharCol];
            const extraCols = currChar ? currChar.length - 1 : 0;
            currCharCol += extraCols;
            // ... some emojis have text versions e.g. [..."❤️"] == ['❤', '️']
            const hlCol = currCharCol - (currChar ? [...currChar].length - 1 : 0);

            do {
                if (currChar === "\t") {
                    add(cell, cell.text);
                    for (let i = 0; i < calcTabCells(currCharCol) - 1; i++) {
                        cell = cellIter.next();
                        cell && add(cell, cell.text);
                    }

                    break;
                }

                if (currChar && isDouble(currChar)) {
                    if (currChar === cell.text) {
                        add(cell);
                        break;
                    }

                    add(cell, cell.text);
                    if (!isDouble(cell.text)) {
                        const nextCell = cellIter.next();
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

            if (!hls.length || !hls.some((d) => d.hlId !== 0)) {
                if (gridRow[hlCol]) {
                    hasUpdates = true;
                    delete gridRow[hlCol];
                }
            } else {
                hasUpdates = true;
                gridRow[hlCol] = hls;
            }
            /////////////////////////////////////////////
            currCharCol++;
            cell = cellIter.next();
        }

        return hasUpdates;
    }

    shiftHighlights(by: number, from: number): void {
        if (by > 0) {
            // remove clipped out rows
            for (let i = 0; i < by; i++) {
                delete this.grid[from + i];
            }
            // first get non empty indexes, then process, seems faster than iterating whole array
            const idxs: number[] = [];
            this.grid.forEach((_row, idx) => {
                idxs.push(idx);
            });
            // shift
            for (const idx of idxs) {
                if (idx <= from) {
                    continue;
                }
                this.grid[idx - by] = this.grid[idx];
                delete this.grid[idx];
            }
        } else if (by < 0) {
            // remove clipped out rows
            for (let i = 0; i < Math.abs(by); i++) {
                delete this.grid[from !== 0 ? from + i : this.grid.length - 1 - i];
            }
            const idxs: number[] = [];
            this.grid.forEach((_row, idx) => {
                idxs.push(idx);
            });
            for (const idx of idxs.reverse()) {
                if (idx <= from) {
                    continue;
                }
                this.grid[idx + Math.abs(by)] = this.grid[idx];
                delete this.grid[idx];
            }
        }
    }

    maxColInRow(row: number) {
        const gridRow = this.grid[row];
        if (!gridRow) {
            return 0;
        }

        let currMaxCol = 0;
        gridRow.forEach((_, col) => {
            if (col > currMaxCol) currMaxCol = col;
        });

        return currMaxCol;
    }

    forEachRow(func: (rowHighlights: Highlight[][], row: number) => void) {
        this.grid.forEach(func);
    }
}

class CellIter {
    private _index = 0;
    constructor(private _cells: ValidCell[]) {}
    next(): { text: string; hlId: number } | undefined {
        return this._cells[this._index++];
    }
    getNext(): { text: string; hlId: number } | undefined {
        return this._cells[this._index];
    }
    setNext(hlId: number, text: string) {
        if (this._index < this._cells.length) {
            this._cells[this._index] = { hlId, text };
        }
    }
}

// 你 length:1 width:2
// 🚀 length:2 width:2
// 🕵️ length:3 width:2
// ❤️ length:2 width:1
const isDouble = (c?: string) => wcswidth(c) === 2 || (c ?? "").length > 1;
const segment: (str: string) => string[] = (() => {
    const splitter = new GraphemeSplitter();
    return (str) => splitter.splitGraphemes(str);
})();
