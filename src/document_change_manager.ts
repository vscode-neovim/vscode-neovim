import diff from "fast-diff";
import { NeovimClient } from "neovim";
import {
    Disposable,
    EndOfLine,
    Position,
    ProgressLocation,
    Range,
    Selection,
    TextDocument,
    TextDocumentChangeEvent,
    TextDocumentContentChangeEvent,
    TextEditor,
    window,
    workspace,
} from "vscode";
import { Mutex } from "async-mutex";

import { BufferManager } from "./buffer_manager";
import { Logger } from "./logger";
import {
    applyEditorDiffOperations,
    callAtomic,
    computeEditorOperationsFromDiff,
    diffLineToChars,
    convertCharNumToByteNum,
    getDocumentLineArray,
    prepareEditRangesFromDiff,
    ManualPromise,
    convertVimPositionToEditorPosition,
} from "./utils";
import { MainController } from "./main_controller";

const LOG_PREFIX = "DocumentChangeManager";

export class DocumentChangeManager implements Disposable {
    private disposables: Disposable[] = [];
    /**
     * Array of pending events to apply in batch
     * ! vscode text editor operations are async and can't be executed in parallel.
     * ! We can execute them synchronously by awaiting each change but it will be very slow
     * ! So group buffer changes within 50ms and execute them in batch
     */
    private pendingEvents: Array<Parameters<NonNullable<BufferManager["onBufferEvent"]>>> = [];
    /**
     * Buffer skipping update map
     * ! Since neovim change will trigger onDocumentChangeEvent we need to handle it and don't send a change again
     * ! For it we optimistically increase skipTicks for each change originated from vscode and check it in neovim buffer event handler
     */
    private bufferSkipTicks: Map<number, number> = new Map();
    /**
     * Document version tracking
     * ! Same as previous property, but reverse
     */
    private documentSkipVersionOnChange: WeakMap<TextDocument, number> = new WeakMap();
    /**
     * Pending document changes promise. Being set early when first change event for a document is received
     * ! Since operations are async it's possible we receive other updates (such as cursor, HL) for related editors with document before
     * ! text change will be applied. In this case we need to queue such changes (through .then()) and wait for change operation completion
     */
    private textDocumentChangePromise: Map<TextDocument, Array<ManualPromise>> = new Map();
    /**
     * Stores cursor pos after document change in neovim
     */
    private cursorAfterTextDocumentChange: WeakMap<TextDocument, Position> = new WeakMap();
    /**
     * Holds document content last known to neovim.
     * ! This is used to convert vscode ranges to neovim bytes.
     * ! It's possible to just fetch content from neovim and check instead of tracking here, but this will add unnecessary lag
     */
    private documentContentInNeovim: WeakMap<TextDocument, string> = new WeakMap();
    /**
     * True when we're currently applying edits, so incoming changes will go into pending events queue
     */
    private applyingEdits = false;
    /**
     * Lock edits being sent to neovim
     */
    public documentChangeLock = new Mutex();

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private main: MainController,
    ) {
        this.main.bufferManager.onBufferEvent = this.onNeovimChangeEvent;
        this.main.bufferManager.onBufferInit = this.onBufferInit;
        this.disposables.push(workspace.onDidChangeTextDocument(this.onChangeTextDocument));
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public eatDocumentCursorAfterChange(doc: TextDocument): Position | undefined {
        const cursor = this.cursorAfterTextDocumentChange.get(doc);
        this.cursorAfterTextDocumentChange.delete(doc);
        return cursor;
    }

    public async getDocumentChangeCompletionLock(doc: TextDocument): Promise<void> {
        const promises = this.textDocumentChangePromise.get(doc);
        if (!promises || !promises.length) {
            return;
        }
        await Promise.all(promises.map((p) => p.promise).filter(Boolean));
    }

    public hasDocumentChangeCompletionLock(doc: TextDocument): boolean {
        return (this.textDocumentChangePromise.get(doc)?.length || 0) > 0;
    }

    private onBufferInit: BufferManager["onBufferInit"] = (id, doc) => {
        this.logger.debug(`${LOG_PREFIX}: Init buffer content for bufId: ${id}, uri: ${doc.uri.toString()}`);
        this.documentContentInNeovim.set(doc, doc.getText());
    };

    private onNeovimChangeEvent: BufferManager["onBufferEvent"] = (
        bufId,
        tick,
        firstLine,
        lastLine,
        linedata,
        more,
    ) => {
        this.logger.debug(`${LOG_PREFIX}: Received neovim buffer changed event for bufId: ${bufId}, tick: ${tick}`);
        const doc = this.main.bufferManager.getTextDocumentForBufferId(bufId);
        if (!doc) {
            this.logger.debug(`${LOG_PREFIX}: No text document for buffer: ${bufId}`);
            return;
        }
        const skipTick = this.bufferSkipTicks.get(bufId) || 0;
        if (skipTick >= tick) {
            this.logger.debug(`${LOG_PREFIX}: BufId: ${bufId} skipping tick: ${tick}`);
            return;
        }
        // happens after undo
        if (firstLine === lastLine && linedata.length === 0) {
            this.logger.debug(`${LOG_PREFIX}: BufId: ${bufId} empty change, skipping`);
            return;
        }
        if (!this.textDocumentChangePromise.has(doc)) {
            this.textDocumentChangePromise.set(doc, []);
        }
        this.textDocumentChangePromise.get(doc)!.push(new ManualPromise());

        this.pendingEvents.push([bufId, tick, firstLine, lastLine, linedata, more]);
        if (!this.applyingEdits) {
            this.applyEdits();
        }
    };

    private applyEdits = async (): Promise<void> => {
        this.applyingEdits = true;
        this.logger.debug(`${LOG_PREFIX}: Applying neovim edits`);
        // const edits = this.pendingEvents.splice(0);
        let resolveProgress: undefined | (() => void);
        const progressTimer = setTimeout(() => {
            window.withProgress<void>(
                { location: ProgressLocation.Notification, title: "Applying neovim edits" },
                () => new Promise((res) => (resolveProgress = res)),
            );
        }, 1000);

        while (this.pendingEvents.length) {
            const newTextByDoc: Map<TextDocument, string[]> = new Map();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            let edit = this.pendingEvents.shift();
            while (edit) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const [bufId, _tick, firstLine, lastLine, data, _more] = edit;
                const doc = this.main.bufferManager.getTextDocumentForBufferId(bufId);
                if (!doc) {
                    this.logger.warn(`${LOG_PREFIX}: No document for ${bufId}, skip`);
                    continue;
                }
                this.logger.debug(`${LOG_PREFIX}: Accumulating edits for ${doc.uri.toString()}, bufId: ${bufId}`);
                if (!newTextByDoc.get(doc)) {
                    newTextByDoc.set(doc, getDocumentLineArray(doc));
                }
                let lines = newTextByDoc.get(doc)!;
                // nvim sends following:
                // 1. string change - firstLine is the changed line , lastLine + 1
                // 2. cleaned line but not deleted - first line is the changed line, lastLine + 1, linedata is ""
                // 3. newline insert - firstLine = lastLine and linedata is "" or new data
                // 4. line deleted - firstLine is changed line, lastLine + 1, linedata is empty []
                // 5. multiple empty lines deleted (sometimes happens), firstLine is changedLine - shouldn't be deleted, lastLine + 1, linedata is ""
                // LAST LINE is exclusive and can be out of the last editor line
                if (firstLine !== lastLine && lastLine === firstLine + 1 && data.length === 1 && data[0] === "") {
                    // 2
                    for (let line = firstLine; line < lastLine; line++) {
                        lines[line] = "";
                    }
                } else if (firstLine !== lastLine && data.length === 1 && data[0] === "") {
                    // 5
                    for (let line = 1; line < lastLine - firstLine; line++) {
                        lines.splice(firstLine, 1);
                    }
                    lines[firstLine] = "";
                } else if (firstLine !== lastLine && !data.length) {
                    // 4
                    for (let line = 0; line < lastLine - firstLine; line++) {
                        lines.splice(firstLine, 1);
                    }
                } else if (firstLine === lastLine) {
                    // 3
                    if (firstLine > lines.length) {
                        data.unshift("");
                    }
                    if (firstLine === 0) {
                        lines.unshift(...data);
                    } else {
                        lines = [...lines.slice(0, firstLine), ...data, ...lines.slice(firstLine)];
                    }
                } else {
                    // 1 or 3
                    // handle when change is overflow through editor lines. E.g. pasting on last line.
                    // Without newline it will append to the current one
                    if (firstLine >= lines.length) {
                        data.unshift("");
                    }
                    lines = [...lines.slice(0, firstLine), ...data, ...lines.slice(lastLine)];
                }
                newTextByDoc.set(doc, lines);
                edit = this.pendingEvents.shift();
            }
            // replacing lines with WorkspaceEdit() moves cursor to the end of the line, unfortunately this won't work
            // const workspaceEdit = new vscode.WorkspaceEdit();
            for (const [doc, newLines] of newTextByDoc) {
                const lastPromiseIdx = this.textDocumentChangePromise.get(doc)?.length || 0;
                try {
                    this.logger.debug(`${LOG_PREFIX}: Applying edits for ${doc.uri.toString()}`);
                    if (doc.isClosed) {
                        this.logger.debug(`${LOG_PREFIX}: Document was closed, skippnig`);
                        continue;
                    }
                    const editor = window.visibleTextEditors.find((e) => e.document === doc);
                    if (!editor) {
                        this.logger.debug(`${LOG_PREFIX}: No visible text editor for document, skipping`);
                        continue;
                    }
                    let oldText = doc.getText();
                    const eol = doc.eol === EndOfLine.CRLF ? "\r\n" : "\n";
                    let newText = newLines.join(eol);
                    // add few lines to the end otherwise diff may be wrong for a newline characters
                    oldText += `${eol}end${eol}end`;
                    newText += `${eol}end${eol}end`;
                    const diffPrepare = diffLineToChars(oldText, newText);
                    const d = diff(diffPrepare.chars1, diffPrepare.chars2);
                    const ranges = prepareEditRangesFromDiff(d);
                    if (!ranges.length) {
                        continue;
                    }
                    this.documentSkipVersionOnChange.set(doc, doc.version + 1);

                    const cursorBefore = editor.selection.active;
                    const success = await editor.edit(
                        (builder) => {
                            for (const range of ranges) {
                                const text = newLines.slice(range.newStart, range.newEnd + 1);
                                if (range.type === "removed") {
                                    if (range.end >= editor.document.lineCount - 1 && range.start > 0) {
                                        const startChar = editor.document.lineAt(range.start - 1).range.end.character;
                                        builder.delete(new Range(range.start - 1, startChar, range.end, 999999));
                                    } else {
                                        builder.delete(new Range(range.start, 0, range.end + 1, 0));
                                    }
                                } else if (range.type === "changed") {
                                    // builder.delete(new Range(range.start, 0, range.end, 999999));
                                    // builder.insert(new Position(range.start, 0), text.join("\n"));
                                    // !builder.replace() can select text. This usually happens when you add something at end of a line
                                    // !We're trying to mitigate it here by checking if we're just adding characters and using insert() instead
                                    // !As fallback we look after applying edits if we have selection
                                    const oldText = editor.document
                                        .getText(new Range(range.start, 0, range.end, 99999))
                                        .replace("\r\n", "\n");
                                    const newText = text.join("\n");
                                    if (newText.length > oldText.length && newText.startsWith(oldText)) {
                                        builder.insert(
                                            new Position(range.start, oldText.length),
                                            newText.slice(oldText.length),
                                        );
                                    } else {
                                        const changeSpansOneLineOnly =
                                            range.start == range.end && range.newStart == range.newEnd;

                                        let editorOps;

                                        if (changeSpansOneLineOnly) {
                                            editorOps = computeEditorOperationsFromDiff(diff(oldText, newText));
                                        }

                                        // If supported, efficiently modify only part of line that has changed by
                                        // generating a diff and computing editor operations from it. This prevents
                                        // flashes of non syntax-highlighted text (e.g. when `x` or `cw`, only
                                        // remove a single char/the word).
                                        if (editorOps && changeSpansOneLineOnly) {
                                            applyEditorDiffOperations(builder, { editorOps, line: range.newStart });
                                        } else {
                                            builder.replace(
                                                new Range(range.start, 0, range.end, 999999),
                                                text.join("\n"),
                                            );
                                        }
                                    }
                                } else if (range.type === "added") {
                                    if (range.start >= editor.document.lineCount) {
                                        text.unshift(
                                            ...new Array(range.start - (editor.document.lineCount - 1)).fill(""),
                                        );
                                    } else {
                                        text.push("");
                                    }
                                    builder.insert(new Position(range.start, 0), text.join("\n"));
                                    // !builder.replace() selects text
                                    // builder.replace(new Position(range.start, 0), text.join("\n"));
                                }
                            }
                        },
                        { undoStopAfter: false, undoStopBefore: false },
                    );
                    const docPromises = this.textDocumentChangePromise.get(doc)?.splice(0, lastPromiseIdx) || [];
                    if (success) {
                        if (!editor.selection.anchor.isEqual(editor.selection.active)) {
                            editor.selections = [new Selection(editor.selection.active, editor.selection.active)];
                        } else {
                            // Some editor operations change cursor position. This confuses cursor
                            // sync from Vim to Code (e.g. when cursor did not change in Vim but
                            // changed in Code). Fix by forcing cursor position to stay the same
                            // indepent of the diff operation in question.
                            editor.selections = [new Selection(cursorBefore, cursorBefore)];
                        }
                        this.cursorAfterTextDocumentChange.set(editor.document, editor.selection.active);
                        docPromises.forEach((p) => p.resolve && p.resolve());
                        this.logger.debug(`${LOG_PREFIX}: Changes succesfully applied for ${doc.uri.toString()}`);
                        this.documentContentInNeovim.set(doc, doc.getText());
                    } else {
                        docPromises.forEach((p) => {
                            p.promise.catch(() =>
                                this.logger.warn(`${LOG_PREFIX}: Edit was canceled for doc: ${doc.uri.toString()}`),
                            );
                            p.reject();
                        });
                        this.logger.warn(`${LOG_PREFIX}: Changes were not applied for ${doc.uri.toString()}`);
                    }
                } catch (e) {
                    this.logger.error(`${LOG_PREFIX}: Error applying neovim edits, error: ${(e as Error).message}`);
                }
            }
        }
        const promises = [...this.textDocumentChangePromise.values()].flatMap((p) => p);
        this.textDocumentChangePromise.clear();
        promises.forEach((p) => p.resolve && p.resolve());
        // better to be safe - if event was inserted after exit the while() block but before exit the function
        if (progressTimer) {
            clearTimeout(progressTimer);
        }
        if (resolveProgress) {
            resolveProgress();
        }
        if (this.pendingEvents.length) {
            this.applyEdits();
        }
        this.applyingEdits = false;
    };

    private onChangeTextDocument = async (e: TextDocumentChangeEvent): Promise<void> => {
        const { document: doc } = e;
        const origText = this.documentContentInNeovim.get(doc);
        if (origText == null) {
            this.logger.warn(`${LOG_PREFIX}: Can't get last known neovim content for ${doc.uri.toString()}, skipping`);
            return;
        }
        this.documentContentInNeovim.set(doc, doc.getText());
        await this.documentChangeLock.runExclusive(async () => await this.onChangeTextDocumentLocked(e, origText));
    };

    private onChangeTextDocumentLocked = async (e: TextDocumentChangeEvent, origText: string): Promise<void> => {
        const { document: doc, contentChanges } = e;

        this.logger.debug(`${LOG_PREFIX}: Change text document for uri: ${doc.uri.toString()}`);
        this.logger.debug(
            `${LOG_PREFIX}: Version: ${doc.version}, skipVersion: ${this.documentSkipVersionOnChange.get(doc)}`,
        );
        if ((this.documentSkipVersionOnChange.get(doc) ?? 0) >= doc.version) {
            this.logger.debug(`${LOG_PREFIX}: Skipping a change since versions equals`);
            return;
        }

        const bufId = this.main.bufferManager.getBufferIdForTextDocument(doc);
        if (!bufId) {
            this.logger.warn(`${LOG_PREFIX}: No neovim buffer for ${doc.uri.toString()}`);
            return;
        }

        let editor: TextEditor | undefined;
        if (window.activeTextEditor?.document === doc) {
            editor = window.activeTextEditor;
        }

        const eol = doc.eol === EndOfLine.LF ? "\n" : "\r\n";
        const requests = this.parseDocumentChanges(editor, bufId, contentChanges, origText, eol);

        const bufTick: number = await this.client.request("nvim_buf_get_changedtick", [bufId]);
        if (!bufTick) {
            this.logger.warn(`${LOG_PREFIX}: Can't get changed tick for bufId: ${bufId}, deleted?`);
            return;
        }
        this.logger.debug(
            `${LOG_PREFIX}: BufId: ${bufId}, lineChanges: ${requests.length}, tick: ${bufTick}, skipTick: ${
                bufTick + requests.length
            }`,
        );
        this.bufferSkipTicks.set(bufId, bufTick + contentChanges.length);

        this.logger.debug(`${LOG_PREFIX}: Setting wantInsertCursorUpdate to false`);
        this.main.cursorManager.wantInsertCursorUpdate = false;
        if (requests.length) await callAtomic(this.client, requests, this.logger, LOG_PREFIX);
    };

    // takes a list of changes and returns a list of neovim requests.
    // normally, will apply the changes directly using nvim_buf_set_text.
    // however, when typing is detected (a contiunous addition/removal next to the cursor), nvim_input will be used to properly set dot-repeat
    private parseDocumentChanges(
        editor: TextEditor | undefined,
        bufId: number,
        changes: readonly TextDocumentContentChangeEvent[],
        origText: string,
        eol: string,
    ): [string, unknown[]][] {
        const requests: [string, unknown[]][] = [];
        const gridId = editor && this.main.bufferManager.getGridIdFromEditor(editor);
        const cursorNvim = gridId && this.main.viewportManager.getCursorFromViewport(gridId);
        const cursor = cursorNvim && convertVimPositionToEditorPosition(editor, cursorNvim);
        if (cursor) {
            // the absolute index of the cursor in the document
            let cursorIndex =
                cursor.line > 0
                    ? origText.split(eol).slice(0, cursor.line).join(eol).length + cursor.character + eol.length
                    : cursor.character;
            let input = "";
            for (const change of changes) {
                const start = change.range.start;
                const end = change.range.end;
                const text = change.text;
                const rangeLength = change.rangeLength;

                // the absolute index of the start of the change in the document
                const startIndex =
                    start.line > 0
                        ? origText.split(eol).slice(0, start.line).join(eol).length + start.character + eol.length
                        : start.character;
                // the absolute index of the end of the change in the document
                const endIndex =
                    end.line > 0
                        ? origText.split(eol).slice(0, end.line).join(eol).length + end.character + eol.length
                        : end.character;

                if (rangeLength == 0 && startIndex === cursorIndex) {
                    // insert text
                    input += text;
                    cursorIndex += text.length;
                    origText = origText.slice(0, startIndex) + text + origText.slice(endIndex);
                } else if (text === "" && startIndex === cursorIndex - rangeLength) {
                    // delete text
                    input += `${"<BS>".repeat(rangeLength)}`;
                    cursorIndex -= rangeLength;
                    origText = origText.slice(0, startIndex) + origText.slice(endIndex);
                } else if (text === "" && endIndex === cursorIndex + rangeLength) {
                    // delete text to the right
                    input += `${"<Del>".repeat(rangeLength)}`;
                    origText = origText.slice(0, startIndex) + origText.slice(endIndex);
                } else {
                    // other
                    if (input) requests.push(["nvim_input", [input]]);
                    const startBytes = convertCharNumToByteNum(origText.split(eol)[start.line], start.character);
                    const endBytes = convertCharNumToByteNum(origText.split(eol)[end.line], end.character);
                    requests.push([
                        "nvim_buf_set_text",
                        [bufId, start.line, startBytes, end.line, endBytes, text.split(eol)],
                    ]);
                }
            }
            if (input) requests.push(["nvim_input", [input]]);
        } else {
            for (const c of changes) {
                const start = c.range.start;
                const end = c.range.end;
                const text = c.text;
                const startBytes = convertCharNumToByteNum(origText.split(eol)[start.line], start.character);
                const endBytes = convertCharNumToByteNum(origText.split(eol)[end.line], end.character);
                requests.push([
                    "nvim_buf_set_text",
                    [bufId, start.line, startBytes, end.line, endBytes, text.split(eol)],
                ]);
            }
        }

        return requests;
    }
}
