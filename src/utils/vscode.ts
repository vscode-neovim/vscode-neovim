import { execSync } from "child_process";

import { calcPatch } from "fast-myers-diff";
import {
    Disposable,
    EndOfLine,
    Position,
    Progress as VSCodeProgress,
    Range,
    Selection,
    TextDocument,
    TextDocumentContentChangeEvent,
    TextEditor,
    commands,
    ProgressOptions as VSCodeProgressOptions,
    window,
} from "vscode";

import { config } from "../config";

import { convertByteNumToCharNum, convertCharNumToByteNum } from "./text";
import { ManualPromise } from "./async";

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

export function disposeAll(disposables: Disposable[]): void {
    while (disposables.length) {
        try {
            disposables.pop()?.dispose();
        } catch (e) {
            console.warn(e);
        }
    }
}

export function getDocumentLineArray(doc: TextDocument): string[] {
    const eol = doc.eol === EndOfLine.CRLF ? "\r\n" : "\n";
    return doc.getText().split(eol);
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

/**
 * Convert ranges to selections
 * @param ranges An array of ranges, where the start is the anchor and the end is the active position.
 * @param document The document used to validate the range.
 * @returns The converted selections.
 */
export function rangesToSelections(
    ranges: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    }[],
    document?: TextDocument,
): Selection[] {
    return ranges.map((r) => {
        const start = new Position(r.start.line, r.start.character);
        const end = new Position(r.end.line, r.end.character);
        if (!document) return new Selection(start, end);
        const reversed = start.isAfter(end);
        const range = document.validateRange(new Range(start, end));
        return range.start.isBefore(range.end) && reversed
            ? new Selection(range.end, range.start)
            : new Selection(range.start, range.end);
    });
}

/**
 * Translate from a Windows path to a WSL path
 * @param path Windows path
 * @returns WSL path
 */
export const wslpath = (path: string) => {
    // execSync returns a newline character at the end
    const distro = config.wslDistribution.length ? `-d ${config.wslDistribution}` : "";
    return execSync(`C:\\Windows\\system32\\wsl.exe ${distro} wslpath '${path}'`).toString().trim();
};

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

    public static reset() {
        for (const key of this.cache.keys()) {
            commands.executeCommand("setContext", key, undefined);
        }
        this.cache.clear();
    }
}

/**
 * Represents a progress indicator in VSCode.
 */
export class Progress implements Disposable {
    private disposed = false;
    private startTimer?: NodeJS.Timeout;
    private promise?: ManualPromise;
    private progress?: VSCodeProgress<{ message?: string }>;
    private message?: string;

    /**
     * Checks if the progress indicator is currently active.
     */
    public get isProgressing(): boolean {
        return !!this.progress;
    }

    /**
     * Reports a progress message to the indicator.
     * @param message The message to report.
     */
    public report(message: string) {
        this.message = message;
        try {
            this.progress?.report({ message });
        } catch {
            // ignore
        }
    }

    /**
     * Starts the progress indicator.
     * @param options The options for the progress indicator.
     * @param timeout The timeout in milliseconds before starting the indicator.
     */
    public start(options: VSCodeProgressOptions, timeout: number = 0) {
        if (this.disposed) return; // Keep silent

        this.done();
        this.startTimer = setTimeout(() => {
            this.promise = new ManualPromise();
            window.withProgress(options, async (progress) => {
                this.progress = progress;
                if (this.message) {
                    progress.report({ message: this.message });
                }
                await this.promise?.promise;
            });
        }, timeout);
    }

    /**
     * Completes the progress indicator.
     */
    public done() {
        this.progress = undefined;
        this.promise?.resolve();
        this.promise = undefined;
        clearTimeout(this.startTimer);
        this.startTimer = undefined;
        this.message = undefined;
    }

    public dispose() {
        this.done();
        this.disposed = true;
    }
}
