import { Mutex } from "async-mutex";
import {
    Disposable,
    EndOfLine,
    Position,
    ProgressLocation,
    Selection,
    TextDocument,
    TextDocumentChangeEvent,
    window,
    workspace,
    LogLevel,
} from "vscode";

import actions from "./actions";
import { BufferManager } from "./buffer_manager";
import { createLogger } from "./logger";
import { MainController } from "./main_controller";
import {
    DotRepeatChange,
    ManualPromise,
    accumulateDotRepeatChange,
    calcDiffWithPosition,
    convertCharNumToByteNum,
    disposeAll,
    getDocumentLineArray,
    isChangeSubsequentToChange,
    isCursorChange,
    normalizeDotRepeatChange,
} from "./utils";

const logger = createLogger("DocumentChangeManager");

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
     * Dot repeat workaround
     */
    private dotRepeatChange: DotRepeatChange | undefined;
    /**
     * True when we're currently applying edits, so incoming changes will go into pending events queue
     */
    private applyingEdits = false;
    /**
     * Lock edits being sent to neovim
     */
    public documentChangeLock = new Mutex();

    private get client() {
        return this.main.client;
    }

    public constructor(private main: MainController) {
        this.main.bufferManager.onBufferEvent = this.onNeovimChangeEvent;
        this.main.bufferManager.onBufferInit = this.onBufferInit;
        this.disposables.push(workspace.onDidChangeTextDocument(this.onChangeTextDocument));
    }

    public dispose(): void {
        disposeAll(this.disposables);
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

    public async syncDotRepeatWithNeovim(): Promise<void> {
        // dot-repeat executes last change across all buffers.
        // So we'll create a temporary buffer & window,
        // replay last changes here to trick neovim and destroy it after
        if (!this.dotRepeatChange) return;
        const edits = this.dotRepeatChange.text.replace(/\r\n/g, "\n");
        const deletes = this.dotRepeatChange.rangeLength;
        this.dotRepeatChange = undefined;
        if (!edits.length && !deletes) return;
        try {
            await actions.lua("dotrepeat_sync", edits, deletes);
        } finally {
            await actions.lua("dotrepeat_restore", edits, deletes);
        }
    }

    private onBufferInit: BufferManager["onBufferInit"] = (id, doc) => {
        logger.log(doc.uri, LogLevel.Debug, `Init buffer content for bufId: ${id}, uri: ${doc.uri.toString()}`);
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
        const doc = this.main.bufferManager.getTextDocumentForBufferId(bufId);
        logger.log(doc?.uri, LogLevel.Debug, `Received neovim buffer changed event for bufId: ${bufId}, tick: ${tick}`);
        if (!doc) {
            logger.log(undefined, LogLevel.Debug, `No text document for buffer: ${bufId}`);
            return;
        }
        const skipTick = this.bufferSkipTicks.get(bufId) || 0;
        if (skipTick >= tick) {
            logger.log(doc.uri, LogLevel.Debug, `BufId: ${bufId} skipping tick: ${tick}`);
            return;
        }
        // happens after undo
        if (firstLine === lastLine && linedata.length === 0) {
            logger.log(doc.uri, LogLevel.Debug, `BufId: ${bufId} empty change, skipping`);
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
        logger.log(undefined, LogLevel.Debug, `Applying neovim edits`);
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
            let edit = this.pendingEvents.shift();
            while (edit) {
                const [bufId, _tick, firstLine, lastLine, data, _more] = edit;
                const doc = this.main.bufferManager.getTextDocumentForBufferId(bufId);
                if (!doc) {
                    logger.log(undefined, LogLevel.Warning, `No document for ${bufId}, skip`);
                    continue;
                }
                logger.log(doc.uri, LogLevel.Debug, `Accumulating edits for ${doc.uri.toString()}, bufId: ${bufId}`);
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
                    logger.log(doc.uri, LogLevel.Debug, `Applying edits for ${doc.uri.toString()}`);
                    if (doc.isClosed) {
                        logger.log(doc.uri, LogLevel.Debug, `Document was closed, skippnig`);
                        continue;
                    }
                    const editor = window.visibleTextEditors.find((e) => e.document === doc);
                    if (!editor) {
                        logger.log(doc.uri, LogLevel.Debug, `No visible text editor for document, skipping`);
                        continue;
                    }
                    const oldText = doc.getText().replace(/\r\n/g, "\n");
                    const newText = newLines.join("\n");

                    const cursorBefore = editor.selection.active;

                    // 1. Manually increment document version to avoid unexpected updates
                    this.documentSkipVersionOnChange.set(doc, doc.version + 1);
                    const success = await editor.edit(
                        (builder) => {
                            const changes = calcDiffWithPosition(oldText, newText);
                            for (const { range, text } of changes) {
                                builder.replace(range, text);
                            }
                        },
                        { undoStopAfter: false, undoStopBefore: false },
                    );
                    // 2. Set the actual version number after applying changes to prevent loss of the next update
                    // Although successful, the document version may not actually increase.
                    // Example: Using "S" to delete empty line does not actually change the text.
                    this.documentSkipVersionOnChange.set(doc, doc.version);

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
                        logger.log(doc.uri, LogLevel.Debug, `Changes succesfully applied for ${doc.uri.toString()}`);
                        this.documentContentInNeovim.set(doc, doc.getText());
                    } else {
                        docPromises.forEach((p) => {
                            p.promise.catch(() =>
                                logger.log(
                                    doc.uri,
                                    LogLevel.Warning,
                                    `Edit was canceled for doc: ${doc.uri.toString()}`,
                                ),
                            );
                            p.reject();
                        });
                        logger.log(doc.uri, LogLevel.Warning, `Changes were not applied for ${doc.uri.toString()}`);
                    }
                } catch (e) {
                    logger.log(doc.uri, LogLevel.Error, `Error applying neovim edits, error: ${(e as Error).message}`);
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
        } else {
            this.applyingEdits = false;
        }
    };

    private onChangeTextDocument = async (e: TextDocumentChangeEvent): Promise<void> => {
        const { document: doc } = e;
        const origText = this.documentContentInNeovim.get(doc);
        if (origText == null) {
            logger.log(
                doc.uri,
                LogLevel.Warning,
                `Can't get last known neovim content for ${doc.uri.toString()}, skipping`,
            );
            return;
        }
        this.documentContentInNeovim.set(doc, doc.getText());
        await this.documentChangeLock.runExclusive(async () => await this.onChangeTextDocumentLocked(e, origText));
    };

    private onChangeTextDocumentLocked = async (e: TextDocumentChangeEvent, origText: string): Promise<void> => {
        const { document: doc, contentChanges } = e;
        logger.log(doc.uri, LogLevel.Debug, `Change text document for uri: ${doc.uri.toString()}`);
        const editor = window.visibleTextEditors.find((e) => e.document === doc);
        const bufId = this.main.bufferManager.getBufferIdForTextDocument(doc);
        if (!bufId) {
            logger.log(doc.uri, LogLevel.Warning, `No neovim buffer for ${doc.uri.toString()}`);
            return;
        }
        // onDidChangeTextDocument is also triggered when dirty-state changes
        // We should always sync dirty state with neovim
        await this.client.request("nvim_buf_set_option", [bufId, "modified", doc.isDirty]);

        logger.log(
            doc.uri,
            LogLevel.Debug,
            `Version: ${doc.version}, skipVersion: ${this.documentSkipVersionOnChange.get(doc)}`,
        );
        if ((this.documentSkipVersionOnChange.get(doc) ?? 0) >= doc.version) {
            logger.log(doc.uri, LogLevel.Debug, `Skipping a change since versions equals`);
            return;
        }

        const eol = doc.eol === EndOfLine.LF ? "\n" : "\r\n";
        const activeEditor = window.activeTextEditor;

        // Store dot repeat
        if (activeEditor && activeEditor.document === doc && this.main.modeManager.isInsertMode) {
            const cursor = activeEditor.selection.active;
            for (const change of contentChanges) {
                if (isCursorChange(change, cursor, eol)) {
                    if (this.dotRepeatChange && isChangeSubsequentToChange(change, this.dotRepeatChange)) {
                        this.dotRepeatChange = accumulateDotRepeatChange(change, this.dotRepeatChange);
                    } else {
                        this.dotRepeatChange = normalizeDotRepeatChange(change, eol);
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
            logger.log(doc.uri, LogLevel.Warning, `Can't get changed tick for bufId: ${bufId}, deleted?`);
            return;
        }

        this.bufferSkipTicks.set(bufId, bufTick + changeArgs.length);

        logger.log(doc.uri, LogLevel.Debug, `Setting wantInsertCursorUpdate to false`);
        if (editor) this.main.cursorManager.setWantInsertCursorUpdate(editor, false);

        await actions.lua("handle_changes", bufId, changeArgs);
        await this.client.request("nvim_buf_set_option", [bufId, "modified", doc.isDirty]);

        // Mainly for the changes caused by some vscode commands in visual mode.
        // e.g. move line up/down
        // After synchronizing the changes to nvim, the cursor
        // position/visual range of nvim will change. And the changed result is
        // usually incorrect, so synchronization is forced here.
        if (!this.main.modeManager.isInsertMode) {
            if (editor && editor === activeEditor) {
                // Don't await here, since it will cause a deadlock
                this.main.cursorManager.applySelectionChanged(editor);
            }
        }
    };
}
