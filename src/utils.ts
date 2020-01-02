import { Diff } from "fast-diff";

export interface EditRange {
    start: number;
    end: number;
    newStart: number;
    newEnd: number;
    type: "changed" | "removed" | "added";
}

export type GridLineEvent = [number, number, number, [string, number, number][]];

export function processLineNumberStringFromEvent(
    event: GridLineEvent,
    lineNumberHlId: number,
    prevString: string,
): string {
    const [, , colStart, cells] = event;
    if (!cells.length || cells[0][1] !== lineNumberHlId) {
        return prevString;
    }

    let lineNumStr = "";
    for (const [text, hlId, repeat] of cells) {
        if (hlId != null && hlId !== lineNumberHlId) {
            break;
        }
        for (let i = 0; i < (repeat || 1); i++) {
            lineNumStr += text;
        }
    }
    const newStr = prevString.slice(0, colStart) + lineNumStr;
    return newStr;
}

export function getLineFromLineNumberString(lineStr: string): number {
    const num = parseInt(lineStr.trim(), 10);
    return isNaN(num) ? 0 : num - 1;
}

export function convertLineNumberToString(line: number): string {
    let lineNumStr = line.toString(10);
    // prepend " " for empty lines
    for (let i = lineNumStr.length; i < 7; i++) {
        lineNumStr = " " + lineNumStr;
    }
    return lineNumStr + " ";
}

// Copied from https://github.com/google/diff-match-patch/blob/master/javascript/diff_match_patch_uncompressed.js
export function diffLineToChars(text1: string, text2: string): { chars1: string; chars2: string; lineArray: string[] } {
    const lineArray: string[] = []; // e.g. lineArray[4] == 'Hello\n'
    const lineHash: { [key: string]: number } = {}; // e.g. lineHash['Hello\n'] == 4

    // '\x00' is a valid character, but various debuggers don't like it.
    // So we'll insert a junk entry to avoid generating a null character.
    lineArray[0] = "";

    /**
     * Split a text into an array of strings.  Reduce the texts to a string of
     * hashes where each Unicode character represents one line.
     * Modifies linearray and linehash through being a closure.
     * @param {string} text String to encode.
     * @return {string} Encoded string.
     * @private
     */
    const linesToCharsMunge = (text: string, maxLines: number): string => {
        let chars = "";
        // Walk the text, pulling out a substring for each line.
        // text.split('\n') would would temporarily double our memory footprint.
        // Modifying text would create many large strings to garbage collect.
        let lineStart = 0;
        let lineEnd = -1;
        // Keeping our own length variable is faster than looking it up.
        let lineArrayLength = lineArray.length;
        while (lineEnd < text.length - 1) {
            lineEnd = text.indexOf("\n", lineStart);
            if (lineEnd == -1) {
                lineEnd = text.length - 1;
            }
            let line = text.substring(lineStart, lineEnd + 1);

            // eslint-disable-next-line no-prototype-builtins
            if (lineHash.hasOwnProperty ? lineHash.hasOwnProperty(line) : lineHash[line] !== undefined) {
                chars += String.fromCharCode(lineHash[line]);
            } else {
                if (lineArrayLength == maxLines) {
                    // Bail out at 65535 because
                    // String.fromCharCode(65536) == String.fromCharCode(0)
                    line = text.substring(lineStart);
                    lineEnd = text.length;
                }
                chars += String.fromCharCode(lineArrayLength);
                lineHash[line] = lineArrayLength;
                lineArray[lineArrayLength++] = line;
            }
            lineStart = lineEnd + 1;
        }
        return chars;
    };
    // Allocate 2/3rds of the space for text1, the rest for text2.
    const chars1 = linesToCharsMunge(text1, 40000);
    const chars2 = linesToCharsMunge(text2, 65535);
    return { chars1: chars1, chars2: chars2, lineArray: lineArray };
}

export function prepareEditRangesFromDiff(diffs: Diff[]): EditRange[] {
    const ranges: EditRange[] = [];
    // 0 - not changed, diff.length is length of non changed lines
    // 1 - added, length is added lines
    // -1 removed, length is removed lines
    let oldIdx = 0;
    let newIdx = 0;
    let currRange: EditRange | undefined;
    let currRangeDiff = 0;
    for (let i = 0; i < diffs.length; i++) {
        const [diffRes, diffStr] = diffs[i];
        if (diffRes === 0) {
            if (currRange) {
                // const diff = currRange.newEnd - currRange.newStart - (currRange.end - currRange.start);
                if (currRange.type === "changed") {
                    // changed range is inclusive
                    oldIdx += 1 + (currRange.end - currRange.start);
                    newIdx += 1 + (currRange.newEnd - currRange.newStart);
                } else if (currRange.type === "added") {
                    // added range is non inclusive
                    newIdx += Math.abs(currRangeDiff);
                } else if (currRange.type === "removed") {
                    // removed range is non inclusive
                    oldIdx += Math.abs(currRangeDiff);
                }
                ranges.push(currRange);
                currRange = undefined;
                currRangeDiff = 0;
            }
            oldIdx += diffStr.length;
            newIdx += diffStr.length;
            // if first change is single newline, then it's being eaten into the equal diff. probably comes from optimization by trimming common prefix?
            // if (
            //     ranges.length === 0 &&
            //     diffStr.length !== 1 &&
            //     diffs[i + 1] &&
            //     diffs[i + 1][0] === 1 &&
            //     diffs[i + 1][1].length === 1 &&
            //     diffs[i + 1][1].charCodeAt(0) === 3
            // ) {
            //     oldIdx--;
            //     newIdx--;
            // }
        } else {
            if (!currRange) {
                currRange = {
                    start: oldIdx,
                    end: oldIdx,
                    newStart: newIdx,
                    newEnd: newIdx,
                    type: "changed",
                };
                currRangeDiff = 0;
            }
            if (diffRes === -1) {
                // handle single string change, the diff will be -1,1 in this case
                if (diffStr.length === 1 && diffs[i + 1] && diffs[i + 1][0] === 1 && diffs[i + 1][1].length === 1) {
                    i++;
                    continue;
                }
                currRange.type = "removed";
                currRange.end += diffStr.length - 1;
                currRangeDiff = -diffStr.length;
            } else {
                if (currRange.type === "removed") {
                    currRange.type = "changed";
                } else {
                    currRange.type = "added";
                }
                currRange.newEnd += diffStr.length - 1;
                currRangeDiff += diffStr.length;
            }
        }
    }
    if (currRange) {
        ranges.push(currRange);
    }
    return ranges;
}
