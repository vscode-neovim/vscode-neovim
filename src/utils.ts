import {
    workspace,
    TextEditor,
    TextDocumentContentChangeEvent,
    Position,
    TextDocument,
    EndOfLine,
    Range,
} from "vscode";
import { Diff } from "fast-diff";
import wcwidth from "ts-wcwidth";
import { NeovimClient } from "neovim";

import { Logger } from "./logger";

export const EXT_NAME = "vscode-neovim";
export const EXT_ID = `asvetliakov.${EXT_NAME}`;

export interface EditRange {
    start: number;
    end: number;
    newStart: number;
    newEnd: number;
    type: "changed" | "removed" | "added";
}

export interface GridConf {
    winId: number;
    cursorLine: number;
    cursorPos: number;
    screenLine: number;
    screenPos: number;
    topScreenLineStr: string;
    bottomScreenLineStr: string;
}

export type GridLineEvent = [number, number, number, [string, number, number][]];

/**
 * Stores last changes information for dot repeat
 */
export interface DotRepeatChange {
    /**
     * Num of deleted characters, 0 when only added
     */
    rangeLength: number;
    /**
     * Range offset
     */
    rangeOffset: number;
    /**
     * Change text
     */
    text: string;
    /**
     * Set if it was the first change and started either through o or O
     */
    startMode?: "o" | "O";
    /**
     * Text eol
     */
    eol: string;
}

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
    const newStr = prevString.slice(0, colStart) + lineNumStr + prevString.slice(colStart + lineNumStr.length);
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

function getBytesFromCodePoint(point?: number): number {
    if (point == null) {
        return 0;
    }
    if (point <= 0x7f) {
        return 1;
    }
    if (point <= 0x7ff) {
        return 2;
    }
    if (point >= 0xd800 && point <= 0xdfff) {
        // Surrogate pair: These take 4 bytes in UTF-8 and 2 chars in UCS-2
        return 4;
    }
    if (point < 0xffff) {
        return 3;
    }
    return 4;
}

export function convertCharNumToByteNum(line: string, col: number): number {
    if (col === 0 || !line) {
        return 0;
    }

    let currCharNum = 0;
    let totalBytes = 0;
    while (currCharNum < col) {
        // VIM treats 2 bytes as 1 char pos for grid_cursor_goto/grid_lines (https://github.com/asvetliakov/vscode-neovim/issues/127)
        // but for setting cursor we must use original byte length
        const bytes = getBytesFromCodePoint(line.codePointAt(currCharNum));
        totalBytes += bytes;
        currCharNum++;
        if (currCharNum >= line.length) {
            return totalBytes;
        }
    }
    return totalBytes;
}

export function convertByteNumToCharNum(line: string, col: number): number {
    let totalBytes = 0;
    let currCharNum = 0;
    while (totalBytes < col) {
        if (currCharNum >= line.length) {
            return currCharNum + (col - totalBytes);
        }
        totalBytes += getBytesFromCodePoint(line.codePointAt(currCharNum));
        currCharNum++;
    }
    return currCharNum;
}

export function calculateEditorColFromVimScreenCol(
    line: string,
    screenCol: number,
    tabSize = 1,
    useBytes = false,
): number {
    if (screenCol === 0 || !line) {
        return 0;
    }
    let currentCharIdx = 0;
    let currentVimCol = 0;
    while (currentVimCol < screenCol) {
        currentVimCol +=
            line[currentCharIdx] === "\t"
                ? tabSize - (currentVimCol % tabSize)
                : useBytes
                ? getBytesFromCodePoint(line.codePointAt(currentCharIdx))
                : wcwidth(line[currentCharIdx]);

        currentCharIdx++;
        if (currentCharIdx >= line.length) {
            return currentCharIdx;
        }
    }
    return currentCharIdx;
}

export function getEditorCursorPos(editor: TextEditor, conf: GridConf): { line: number; col: number } {
    const topScreenLine = getLineFromLineNumberString(conf.topScreenLineStr);
    const cursorLine = topScreenLine + conf.screenLine;
    if (cursorLine >= editor.document.lineCount) {
        // rarely happens, but could, usually for external help files when text is not available now (due to async edit or so)
        return {
            col: conf.screenPos,
            line: cursorLine,
        };
    }
    const line = editor.document.lineAt(cursorLine).text;
    const col = calculateEditorColFromVimScreenCol(line, conf.screenPos);
    return {
        line: cursorLine,
        col,
    };
}

export function isChangeSubsequentToChange(
    change: TextDocumentContentChangeEvent,
    lastChange: DotRepeatChange,
): boolean {
    const lastChangeTextLength = lastChange.text.length;
    const lastChangeOffsetStart = lastChange.rangeOffset;
    const lastChangeOffsetEnd = lastChange.rangeOffset + lastChangeTextLength;

    if (change.rangeOffset >= lastChangeOffsetStart && change.rangeOffset <= lastChangeOffsetEnd) {
        return true;
    }

    if (
        change.rangeOffset < lastChangeOffsetStart &&
        change.rangeOffset + change.rangeLength >= lastChangeOffsetStart
    ) {
        return true;
    }

    return false;
}

export function isCursorChange(change: TextDocumentContentChangeEvent, cursor: Position, eol: string): boolean {
    if (change.range.contains(cursor)) {
        return true;
    }
    if (change.range.isSingleLine && change.text) {
        const lines = change.text.split(eol);
        const lineLength = lines.length;
        const newEndLineRange = change.range.start.line + lineLength - 1;
        const newEndLastLineCharRange = change.range.end.character + lines.slice(-1)[0].length;
        if (newEndLineRange >= cursor.line && newEndLastLineCharRange >= cursor.character) {
            return true;
        }
    }
    return false;
}

type LegacySettingName = "neovimPath" | "neovimInitPath";
type SettingPrefix = "neovimExecutablePaths" | "neovimInitVimPaths"; //this needs to be aligned with setting names in package.json
type Platform = "win32" | "darwin" | "linux";

function getSystemSpecificSetting(
    settingPrefix: SettingPrefix,
    legacySetting: { environmentVariableName?: "NEOVIM_PATH"; vscodeSettingName: LegacySettingName },
): string | undefined {
    const settings = workspace.getConfiguration(EXT_NAME);
    const isUseWindowsSubsystemForLinux = settings.get("useWSL");

    //https://github.com/microsoft/vscode/blob/master/src/vs/base/common/platform.ts#L63
    const platform = process.platform as "win32" | "darwin" | "linux";

    const legacyEnvironmentVariable =
        legacySetting.environmentVariableName && process.env[legacySetting.environmentVariableName];

    //some system specific settings can be loaded from process.env and value from env will override setting value
    const legacySettingValue = legacyEnvironmentVariable || settings.get(legacySetting.vscodeSettingName);
    if (legacySettingValue) {
        return legacySettingValue;
    } else if (isUseWindowsSubsystemForLinux && platform === "win32") {
        return settings.get(`${settingPrefix}.${"linux" as Platform}`);
    } else {
        return settings.get(`${settingPrefix}.${platform}`);
    }
}

export function getNeovimPath(): string | undefined {
    const legacySettingInfo = {
        vscodeSettingName: "neovimPath",
        environmentVariableName: "NEOVIM_PATH",
    } as const;
    return getSystemSpecificSetting("neovimExecutablePaths", legacySettingInfo);
}

export function getNeovimInitPath(): string | undefined {
    const legacySettingInfo = {
        vscodeSettingName: "neovimInitPath",
    } as const;
    return getSystemSpecificSetting("neovimInitVimPaths", legacySettingInfo);
}

export function normalizeDotRepeatChange(
    change: TextDocumentContentChangeEvent,
    eol: string,
    startMode?: "o" | "O",
): DotRepeatChange {
    return {
        rangeLength: change.rangeLength,
        rangeOffset: change.rangeOffset,
        text: change.text,
        startMode,
        eol,
    };
}

export function accumulateDotRepeatChange(
    change: TextDocumentContentChangeEvent,
    lastChange: DotRepeatChange,
): DotRepeatChange {
    const newLastChange: DotRepeatChange = {
        ...lastChange,
    };

    const removedLength =
        change.rangeOffset <= lastChange.rangeOffset
            ? change.rangeOffset - lastChange.rangeOffset + change.rangeLength
            : change.rangeLength;

    const sliceBeforeStart = 0;
    const sliceBeforeEnd =
        change.rangeOffset <= lastChange.rangeOffset
            ? // ? sliceBeforeStart + removedLength
              0
            : change.rangeOffset - lastChange.rangeOffset;

    const sliceAfterStart = change.rangeOffset - lastChange.rangeOffset + removedLength;

    // adjust text
    newLastChange.text =
        lastChange.text.slice(sliceBeforeStart, sliceBeforeEnd) + change.text + lastChange.text.slice(sliceAfterStart);

    // adjust offset & range length
    // we need to account the case only when text was deleted before the original change
    if (change.rangeOffset < lastChange.rangeOffset) {
        newLastChange.rangeOffset = change.rangeOffset;
        newLastChange.rangeLength += change.rangeLength;
    }
    return newLastChange;
}

export function editorPositionToNeovimPosition(editor: TextEditor, position: Position): [number, number] {
    const lineText = editor.document.lineAt(position.line).text;
    const byteCol = convertCharNumToByteNum(lineText, position.character);
    return [position.line + 1, byteCol];
}

export function getNeovimCursorPosFromEditor(editor: TextEditor): [number, number] {
    try {
        return editorPositionToNeovimPosition(editor, editor.selection.active);
    } catch {
        return [1, 0];
    }
}

export function getDocumentLineArray(doc: TextDocument): string[] {
    const eol = doc.eol === EndOfLine.CRLF ? "\r\n" : "\n";
    return doc.getText().split(eol);
}

export function normalizeInputString(str: string, wrapEnter = true): string {
    let finalStr = str.replace(/</g, "<LT>");
    if (wrapEnter) {
        finalStr = finalStr.replace(/\n/g, "<CR>");
    }
    return finalStr;
}

export function findLastEvent(name: string, batch: [string, ...unknown[]][]): [string, ...unknown[]] | undefined {
    for (let i = batch.length - 1; i >= 0; i--) {
        const [event] = batch[i];
        if (event === name) {
            return batch[i];
        }
    }
}

/**
 * Wrap nvim callAtomic and check for any errors in result
 * @param client
 * @param requests
 * @param logger
 * @param prefix
 */
export async function callAtomic(
    client: NeovimClient,
    requests: [string, unknown[]][],
    logger: Logger,
    prefix = "",
): Promise<void> {
    const res = await client.callAtomic(requests);
    const errors: string[] = [];
    if (res && Array.isArray(res) && Array.isArray(res[0])) {
        res[0].forEach((res, idx) => {
            if (res) {
                const call = requests[idx];
                const requestName = call?.[0];
                if (requestName !== "nvim_input") {
                    errors.push(`${call?.[0] || "Unknown"}: ${res}`);
                }
            }
        });
    }
    if (errors.length) {
        logger.error(`${prefix}:\n${errors.join("\n")}`);
    }
}

export function isLineWithinFold(visibleRanges: Range[], line: number): boolean {
    if (visibleRanges.find((r) => r.contains(new Position(line, 0)))) {
        return false;
    }
    // if between 2 visible ranges then it's folded line
    // Is this always true? Seems so
    return !!visibleRanges.find(
        (r, idx) => line > r.end.line && visibleRanges[idx + 1] && line < visibleRanges[idx + 1].start.line,
    );
}
