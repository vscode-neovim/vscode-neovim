import { calcPatch } from "fast-myers-diff";
import { NeovimClient } from "neovim";
import wcwidth from "ts-wcwidth";
import {
    Disposable,
    EndOfLine,
    Position,
    Range,
    TextDocument,
    TextDocumentContentChangeEvent,
    TextEditor,
    commands,
} from "vscode";

import { ILogger } from "./logger";

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
     * Text eol
     */
    eol: string;
}

interface DocumentChange {
    range: Range;
    text: string;
    rangeLength: number;
}

// given an array of cumulative line lengths, find the line number given a character position after a known start line.
// return the line as well as the number of characters until the start of the line.
function findLine(lineLengths: number[], pos: number, startLine: number): [number, number] {
    let low = startLine,
        high = lineLengths.length - 1;
    while (low < high) {
        const mid = low + Math.floor((high - low) / 2); // can adjust pivot point based on probability of diffs being close together
        if (lineLengths[mid] <= pos) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }
    const char = low > 0 ? lineLengths[low - 1] : 0;
    return [low, char];
}

// fast-myers-diff accepts a raw 1D string, and outputs a list of operations to apply to the buffer.
// However, we must compute the line and character positions of the operations ourselves.
// Assuming the operations are sequential, we can use a binary search to find the line number given a character position,
// with the search space being the cumulative line lengths, bounded on the left by the last line.
// Then, given a character position, we can start counting from the cursor to find the line number, and the remainder is the character position on the line.
export function* calcDiffWithPosition(oldText: string, newText: string): Generator<DocumentChange> {
    const patch = calcPatch(oldText, newText);
    // generate prefix sum of line lengths (accumulate the length)
    const lines = oldText.split("\n");
    const lineLengths = new Array(lines.length);
    let cumulativeLength = 0;
    for (let i = 0; i < lines.length; i++) {
        cumulativeLength += lines[i].length + 1; // +1 for the newline character
        lineLengths[i] = cumulativeLength;
    }
    let lastLine = 0;
    for (const [start, end, text] of patch) {
        const [lineStart, charToLineStart] = findLine(lineLengths, start, lastLine);
        const [lineEnd, charToLineEnd] = findLine(lineLengths, end, lineStart);
        const charStart = start - charToLineStart;
        const charEnd = end - charToLineEnd;
        const range = new Range(new Position(lineStart, charStart), new Position(lineEnd, charEnd));
        lastLine = lineEnd;
        yield {
            range,
            text,
            rangeLength: end - start,
        };
    }
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
        currCharNum += bytes === 4 ? 2 : 1;
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
        const bytes = getBytesFromCodePoint(line.codePointAt(currCharNum));
        totalBytes += bytes;
        currCharNum += bytes === 4 ? 2 : 1;
    }
    return currCharNum;
}

export function convertVimPositionToEditorPosition(editor: TextEditor, vimPos: Position): Position {
    const line = editor.document.lineAt(vimPos.line).text;
    const character = convertByteNumToCharNum(line, vimPos.character);
    return new Position(vimPos.line, character);
}
export function convertEditorPositionToVimPosition(editor: TextEditor, editorPos: Position): Position {
    const line = editor.document.lineAt(editorPos.line).text;
    const byte = convertCharNumToByteNum(line, editorPos.character);
    return new Position(editorPos.line, byte);
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
        // Surrogate pair: These take 4 bytes in UTF-8/UTF-16 and 2 chars in UTF-16 (JS strings)
        return 4;
    }
    if (point < 0xffff) {
        return 3;
    }
    return 4;
}

export function calculateEditorColFromVimScreenCol(line: string, screenCol: number, tabSize: number): number {
    if (screenCol === 0 || !line) {
        return 0;
    }
    let currentCharIdx = 0;
    let currentVimCol = 0;
    while (currentVimCol < screenCol) {
        if (line[currentCharIdx] === "\t") {
            currentVimCol += tabSize - (currentVimCol % tabSize);
            currentCharIdx++;
        } else {
            currentVimCol += wcwidth(line[currentCharIdx]);
            currentCharIdx++;
        }

        if (currentCharIdx >= line.length) {
            return currentCharIdx;
        }
    }
    return currentCharIdx;
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

export function normalizeDotRepeatChange(change: TextDocumentContentChangeEvent, eol: string): DotRepeatChange {
    return {
        rangeLength: change.rangeLength,
        rangeOffset: change.rangeOffset,
        text: change.text,
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
    logger: ILogger,
): Promise<void> {
    // The type annotation in the Neovim node client seems to be wrong
    // (see https://neovim.io/doc/user/api.html for the correct type for nvim_call_atomic)
    const res = (await client.callAtomic(requests)) as unknown as [unknown[], [number, unknown, string] | null];
    // Should never reach here if neovim is behaving correctly
    if (!(res && Array.isArray(res) && Array.isArray(res[0]))) {
        logger.error(`Unexpected result from nvim_call_atomic`);
        return;
    }
    const returned_errors = res[1];
    if (returned_errors) {
        const [failing_call_idx, err_type, err_msg] = returned_errors;
        const call = requests[failing_call_idx];
        const requestName = call[0];
        const errMsg = `${requestName}: ${err_msg} (Error type: ${err_type})`;
        // TODO: Determine cause for errors for both of these requests
        if (requestName === "nvim_input" || requestName === "nvim_win_close") {
            logger.warn(errMsg);
        } else {
            logger.error(errMsg);
        }
    }
}

/**
 * Manual promise that can be resolved/rejected from outside. Used in document and cursor managers to indicate pending update.
 */
export class ManualPromise {
    public promise: Promise<void>;
    public resolve: () => void = () => {
        // noop
    };
    public reject: () => void = () => {
        // noop
    };

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        this.promise.catch((_err) => {
            // noop
        });
    }
}

/**
 * Wait for a given number of milliseconds
 * @param ms Number of milliseconds
 */
export async function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Credit: https://github.com/VSCodeVim/Vim/blob/5dc9fbf9e7c31a523a348066e61605ed6caf62da/src/util/vscodeContext.ts
type VSCodeContextValue = boolean | string | string[];
/**
 * Wrapper around VS Code's `setContext`.
 * The API call takes several milliseconds to seconds to complete,
 * so let's cache the values and only call the API when necessary.
 */
export abstract class VSCodeContext {
    private static readonly cache: Map<string, VSCodeContextValue> = new Map();

    public static async set(key: string, value?: VSCodeContextValue): Promise<void> {
        const prev = this.get(key);
        if (prev !== value) {
            if (value === undefined) {
                this.cache.delete(key);
            } else {
                this.cache.set(key, value);
            }
            await commands.executeCommand("setContext", key, value);
        }
    }

    public static get(key: string): VSCodeContextValue | undefined {
        return this.cache.get(key);
    }
}

export function disposeAll(disposables: Disposable[]): void {
    while (disposables.length) {
        try {
            disposables.pop()?.dispose();
        } catch (e) {
            console.warn(e);
        }
    }
}
