import wcswidth from "ts-wcwidth";

import { expandTabs, splitGraphemes } from "./text";

/**
 * Checks whether or not the contents of a text cell should actually span two cells. For instance:
 * a  length:1 width:1
 * 你 length:1 width:2
 * 🚀 length:2 width:2
 * 🕵️ length:3 width:2
 * ❤️ length:2 width:1
 *
 * @param cellText The cell text to check
 * @returns Whether or not this cell is a double-width cell
 */
export function isDouble(cellText: string): boolean {
    return wcswidth(cellText) === 2 || cellText.length > 1;
}

export function getWidth(text: string, tabSize: number): number {
    const t = expandTabs(text ?? "", tabSize);
    return splitGraphemes(t).reduce((p, c) => p + (isDouble(c) ? 2 : 1), 0);
}
