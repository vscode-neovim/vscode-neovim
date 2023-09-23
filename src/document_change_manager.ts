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
    window,
    workspace,
} from "vscode";
import { Mutex } from "async-mutex";

import { BufferManager } from "./buffer_manager";
import { Logger } from "./logger";
import { NeovimExtensionRequestProcessable } from "./neovim_events_processable";
import {
    accumulateDotRepeatChange,
    applyEditorDiffOperations,
    callAtomic,
    computeEditorOperationsFromDiff,
    diffLineToChars,
    convertCharNumToByteNum,
    DotRepeatChange,
    getDocumentLineArray,
    isChangeSubsequentToChange,
    isCursorChange,
    normalizeDotRepeatChange,
    prepareEditRangesFromDiff,
    ManualPromise,
} from "./utils";
import { MainController } from "./main_controller";

const LOG_PREFIX = "DocumentChangeManager";

export class DocumentChangeManager implements Disposable, NeovimExtensionRequestProcessable {
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
     * Dot repeat workaround
     */
    private dotRepeatChange: DotRepeatChange | undefined;
    /**
     * A hint for dot-repeat indicating of how the insert mode was started
     */
    private dotRepeatStartModeInsertHint?: "o" | "O";
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

    public async handleExtensionRequest(name: string, args: unknown[]): Promise<void> {
        if (name === "insert-line") {
            const [type] = args as ["before" | "after"];
            this.dotRepeatStartModeInsertHint = type === "before" ? "O" : "o";
            this.logger.debug(`${LOG_PREFIX}: Setting start insert mode hint - ${this.dotRepeatStartModeInsertHint}`);
        }
    }

    public async syncDotRepeatWithNeovim(): Promise<void> {
        // dot-repeat executes last change across all buffers. So we'll create a temporary buffer & window,
        // replay last changes here to trick neovim and destroy it after
        if (!this.dotRepeatChange) {
            return;
        }
        this.logger.debug(`${LOG_PREFIX}: Syncing dot repeat`);
        const dotRepeatChange = { ...this.dotRepeatChange };
        this.dotRepeatChange = undefined;

        const currWin = await this.client.window;

        // temporary buffer to replay the changes
        const buf = await this.client.createBuffer(false, true);
        if (typeof buf === "number") {
            return;
        }
        // create temporary win
        await this.client.setOption("eventignore", "BufWinEnter,BufEnter,BufLeave");
        const win = await this.client.openWindow(buf, true, {
            external: true,
            width: 100,
            height: 100,
        });
        await this.client.setOption("eventignore", "");
        if (typeof win === "number") {
            return;
        }
        const edits: [string, unknown[]][] = [];

        // for delete changes we need an actual text, so let's prefill with something
        // accumulate all possible lengths of deleted text to be safe
        const delRangeLength = dotRepeatChange.rangeLength;
        if (delRangeLength) {
            const stub = new Array(delRangeLength).fill("x").join("");
            edits.push(
                ["nvim_buf_set_lines", [buf.id, 0, 0, false, [stub]]],
                ["nvim_win_set_cursor", [win.id, [1, delRangeLength]]],
            );
        }
        let editStr = "";
        if (dotRepeatChange.startMode) {
            editStr += `<Esc>${dotRepeatChange.startMode}`;
            // remove EOL from first change
            if (dotRepeatChange.text.startsWith(dotRepeatChange.eol)) {
                dotRepeatChange.text = dotRepeatChange.text.slice(dotRepeatChange.eol.length);
            }
        }
        if (dotRepeatChange.rangeLength) {
            editStr += [...new Array(dotRepeatChange.rangeLength).keys()].map(() => "<BS>").join("");
        }
        editStr += dotRepeatChange.text.split(dotRepeatChange.eol).join("\n").replace("<", "<LT>");
        edits.push(["nvim_input", [editStr]]);
        // since nvim_input is not blocking we need replay edits first, then clean up things in subsequent request
        await callAtomic(this.client, edits, this.logger, LOG_PREFIX);

        const cleanEdits: [string, unknown[]][] = [];
        cleanEdits.push(["nvim_set_current_win", [currWin.id]]);
        cleanEdits.push(["nvim_win_close", [win.id, true]]);
        await callAtomic(this.client, cleanEdits, this.logger, LOG_PREFIX);
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
                                        .replace(/\r\n/g, "\n");
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

        const eol = doc.eol === EndOfLine.LF ? "\n" : "\r\n";
        const startModeHint = this.dotRepeatStartModeInsertHint;
        const activeEditor = window.activeTextEditor;

        // Store dot repeat
        if (activeEditor && activeEditor.document === doc && this.main.modeManager.isInsertMode) {
            this.dotRepeatStartModeInsertHint = undefined;
            const cursor = activeEditor.selection.active;
            for (const change of contentChanges) {
                if (isCursorChange(change, cursor, eol)) {
                    if (this.dotRepeatChange && isChangeSubsequentToChange(change, this.dotRepeatChange)) {
                        this.dotRepeatChange = accumulateDotRepeatChange(change, this.dotRepeatChange);
                    } else {
                        this.dotRepeatChange = normalizeDotRepeatChange(change, eol, startModeHint);
                    }
                }
            }
        }

        const changeArgs = [];
        for (const change of contentChanges) {
            const {
                text,
                range: { start, end },
            } = change;
            const startBytes = convertCharNumToByteNum(origText.split(eol)[start.line], start.character);
            const endBytes = convertCharNumToByteNum(origText.split(eol)[end.line], end.character);
            changeArgs.push([start.line, startBytes, end.line, endBytes, text.split(eol)]);
        }

        const bufTick: number = await this.client.request("nvim_buf_get_changedtick", [bufId]);
        if (!bufTick) {
            this.logger.warn(`${LOG_PREFIX}: Can't get changed tick for bufId: ${bufId}, deleted?`);
            return;
        }

        this.bufferSkipTicks.set(bufId, bufTick + changeArgs.length);

        this.logger.debug(`${LOG_PREFIX}: Setting wantInsertCursorUpdate to false`);
        this.main.cursorManager.wantInsertCursorUpdate = false;

        const code = "return require('vscode-neovim.api').handle_changes(...)";
        await this.client.executeLua(code, [bufId, changeArgs]);
    };
}
