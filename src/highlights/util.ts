import GraphemeSplitter from "grapheme-splitter";
import wcswidth from "ts-wcwidth";

import { type LineCell } from "./highlight_grid";

const splitter = new GraphemeSplitter();

export function expandTabs(line: string, tabWidth: number): string {
    const [expanded, _finalIdx] = line.split("").reduce(
        ([acc, idx]: [string, number], char: string): [string, number] => {
            if (char === "\t") {
                const widthHere = tabWidth - (idx % tabWidth);
                const nextAcc = acc + " ".repeat(widthHere);
                return [nextAcc, idx + widthHere];
            }

            return [acc + char, idx + 1];
        },
        ["", 0],
    );

    return expanded;
}

/**
 * Checks whether or not the character should actually span two cells. For instance:
 * a  length:1 width:1
 * 你 length:1 width:2
 * 🚀 length:2 width:2
 * 🕵️ length:3 width:2
 * ❤️ length:2 width:2
 *
 * @param char The character to check
 * @returns Whether or not the char is a double-width character
 */
export function isDouble(char: string): boolean {
    return wcswidth(char) === 2 || char.length > 1;
}

/**
 * Get the width of a piece of text, in cells. Note that the use of tabs is
 * position dependent, and this function must assume a line with tabs starts
 * at position 0in the editor.
 *
 * @param text The text to get the width of
 * @param tabSize The size of tab-widths
 * @returns The width of the text, in cells
 */
export function getWidth(text: string, tabSize: number): number {
    const t = expandTabs(text, tabSize);
    return splitGraphemes(t).reduce((p, c) => p + (isDouble(c) ? 2 : 1), 0);
}

export function splitGraphemes(str: string): string[] {
    return splitter.splitGraphemes(str);
}

export class CellIter {
    private _index = 0;
    constructor(private _cells: LineCell[]) {}
    takeNext(): LineCell | undefined {
        return this._cells[this._index++];
    }
    discardNext() {
        this._index++;
    }
    getNext(): LineCell | undefined {
        return this._cells[this._index];
    }
    setNext(cell: LineCell) {
        if (this._index < this._cells.length) {
            this._cells[this._index] = cell;
        }
    }
}
