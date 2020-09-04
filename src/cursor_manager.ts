import { debounce } from "lodash";
import { NeovimClient, Window } from "neovim";
import {
    commands,
    Disposable,
    Range,
    Selection,
    TextEditor,
    TextEditorCursorStyle,
    TextEditorRevealType,
    TextEditorSelectionChangeEvent,
    TextEditorSelectionChangeKind,
    window,
} from "vscode";

import { BufferManager } from "./buffer_manager";
import { DocumentChangeManager } from "./document_change_manager";
import { Logger } from "./logger";
import { ModeManager } from "./mode_manager";
import {
    NeovimExtensionRequestProcessable,
    NeovimRangeCommandProcessable,
    NeovimRedrawProcessable,
} from "./neovim_events_processable";
import {
    calculateEditorColFromVimScreenCol,
    callAtomic,
    editorPositionToNeovimPosition,
    getNeovimCursorPosFromEditor,
} from "./utils";

const LOG_PREFIX = "CursorManager";

export interface CursorManagerSettings {
    mouseSelectionEnabled: boolean;
}

interface CursorInfo {
    cursorShape: "block" | "horizontal" | "vertical";
}

export class CursorManager
    implements Disposable, NeovimRedrawProcessable, NeovimExtensionRequestProcessable, NeovimRangeCommandProcessable {
    private disposables: Disposable[] = [];
    /**
     * Vim cursor mode mappings
     */
    private cursorModes: Map<string, CursorInfo> = new Map();
    /**
     * Cursor positions per editor in neovim
     * ! Note: we should track this because setting cursor as consequence of neovim event will trigger onDidChangeTextEditorSelection with Command kind
     * ! And we should skip it and don't try to send cursor update into neovim again, otherwise few things may break, especially jumplist
     */
    private neovimCursorPosition: WeakMap<TextEditor, { line: number; col: number }> = new WeakMap();
    /**
     * Special workaround flag to ignore editor selection events
     */
    private ignoreSelectionEvents = false;

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private modeManager: ModeManager,
        private bufferManager: BufferManager,
        private changeManager: DocumentChangeManager,
        private settings: CursorManagerSettings,
    ) {
        this.disposables.push(window.onDidChangeTextEditorSelection(this.onSelectionChanged));
        this.disposables.push(window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors));
    }
    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public async handleExtensionRequest(name: string, args: unknown[]): Promise<void> {
        switch (name) {
            case "visual-edit": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const [append, visualMode, startLine1Based, endLine1Based, endCol0based, skipEmpty] = args as any;
                this.multipleCursorFromVisualMode(
                    !!append,
                    visualMode,
                    startLine1Based - 1,
                    endLine1Based - 1,
                    endCol0based,
                    !!skipEmpty,
                );
                break;
            }
        }
    }

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
        const winCursorsUpdates: Map<number, { line: number; col: number }> = new Map();
        for (const [name, ...args] of batch) {
            const firstArg = args[0] || [];
            switch (name) {
                case "win_viewport": {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    for (const [grid, win, topline, botline, curline, curcol] of args as [
                        number,
                        Window,
                        number,
                        number,
                        number,
                        number,
                    ][]) {
                        winCursorsUpdates.set(win.id, { line: curline, col: curcol });
                    }
                    break;
                }
                case "mode_info_set": {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const [, modes] = firstArg as [string, any[]];
                    for (const mode of modes) {
                        if (!mode.name || !mode.cursor_shape) {
                            continue;
                        }
                        this.cursorModes.set(mode.name, {
                            cursorShape: mode.cursor_shape,
                        });
                    }
                    break;
                }
                case "mode_change": {
                    const [newModeName] = firstArg as [string, never];
                    this.updateCursorStyle(newModeName);
                    break;
                }
            }
        }
        for (const [winId, cursorPos] of winCursorsUpdates) {
            this.logger.debug(
                `${LOG_PREFIX}: Received cursor update from neovim, winId: ${winId}, pos: [${cursorPos.line}, ${cursorPos.col}]`,
            );
            const editor = this.bufferManager.getEditorFromWinId(winId);
            if (!editor) {
                this.logger.warn(`${LOG_PREFIX}: No editor for winId: ${winId}`);
                continue;
            }
            // !For text changes neovim sends first buf_lines_event followed by redraw event
            // !But since changes are asynchronous and will happen after redraw event we need to wait for them first
            const docPromises = this.changeManager.getDocumentChangeCompletionLock(editor.document);
            if (docPromises) {
                docPromises.then(() => {
                    try {
                        const finalCol = calculateEditorColFromVimScreenCol(
                            editor.document.lineAt(cursorPos.line).text,
                            cursorPos.col,
                            // !For cursor updates tab is always counted as 1 col
                            1,
                            true,
                        );
                        this.neovimCursorPosition.set(editor, { line: cursorPos.line, col: finalCol });
                        this.updateCursorPosInEditor(editor, cursorPos.line, finalCol);
                    } catch (e) {
                        this.logger.warn(`${LOG_PREFIX}: ${e.message}`);
                    }
                });
            } else {
                // !Sync call helps with most common operations latency
                try {
                    const finalCol = calculateEditorColFromVimScreenCol(
                        editor.document.lineAt(cursorPos.line).text,
                        cursorPos.col,
                        1,
                        true,
                    );
                    this.neovimCursorPosition.set(editor, { line: cursorPos.line, col: finalCol });
                    this.updateCursorPosInEditor(editor, cursorPos.line, finalCol);
                } catch (e) {
                    this.logger.warn(`${LOG_PREFIX}: ${e.message}`);
                }
            }
        }
        winCursorsUpdates.clear();
    }

    /**
     * Produce vscode selection and execute command
     * @param command VSCode command to execute
     * @param startLine Start line to select. 1based
     * @param endLine End line to select. 1based
     * @param startPos Start pos to select. 1based. If 0 then whole line will be selected
     * @param endPos End pos to select, 1based. If you then whole line will be selected
     * @param leaveSelection When true won't clear vscode selection after running the command
     * @param args Additional args
     */
    public async handleVSCodeRangeCommand(
        command: string,
        startLine: number,
        endLine: number,
        startPos: number,
        endPos: number,
        leaveSelection: boolean,
        args: unknown[],
    ): Promise<unknown> {
        const e = window.activeTextEditor;
        this.logger.debug(
            `${LOG_PREFIX}: Range command: ${command}, range: [${startLine}, ${startPos}] - [${endLine}, ${endPos}], leaveSelection: ${leaveSelection}`,
        );
        if (e) {
            // vi<obj> includes end of line from start pos. This is not very useful, so let's check and remove it
            // vi<obj> always select from top to bottom
            if (endLine > startLine) {
                try {
                    const lineDef = e.document.lineAt(startLine - 1);
                    if (startPos > 0 && startPos - 1 >= lineDef.range.end.character) {
                        startLine++;
                        startPos = 0;
                    }
                } catch {
                    // ignore
                }
            }
            const prevSelections = [...e.selections];
            this.ignoreSelectionEvents = true;
            // startLine is visual start
            if (startLine > endLine) {
                e.selections = [
                    new Selection(
                        startLine - 1,
                        startPos > 0 ? startPos - 1 : 9999999,
                        endLine - 1,
                        endPos > 0 ? endPos - 1 : 0,
                    ),
                ];
            } else {
                e.selections = [
                    new Selection(
                        startLine - 1,
                        startPos > 0 ? startPos - 1 : 0,
                        endLine - 1,
                        endPos > 0 ? endPos - 1 : 9999999,
                    ),
                ];
            }
            const res = await commands.executeCommand(command, ...args);
            this.logger.debug(`${LOG_PREFIX}: Range command completed`);
            if (!leaveSelection) {
                e.selections = prevSelections;
            }
            this.ignoreSelectionEvents = false;
            return res;
        }
    }

    private onDidChangeVisibleTextEditors = (): void => {
        this.updateCursorStyle(this.modeManager.currentMode);
    };

    // ! Need to debounce requests because setting cursor by consequence of neovim event will trigger this method
    // ! and cursor may go out-of-sync and produce a jitter
    private onSelectionChanged = debounce(
        async (e: TextEditorSelectionChangeEvent): Promise<void> => {
            if (this.modeManager.isInsertMode) {
                return;
            }
            if (this.ignoreSelectionEvents) {
                return;
            }
            const { textEditor, kind, selections } = e;
            this.logger.debug(`${LOG_PREFIX}: SelectionChanged`);

            // ! Note: Unfortunately navigating from outline is Command kind, so we can't skip it :(
            // if (kind === TextEditorSelectionChangeKind.Command) {
            //     this.logger.debug(`${LOG_PREFIX}: Skipping command kind`);
            //     return;
            // }

            // wait for possible layout updates first
            this.logger.debug(`${LOG_PREFIX}: Waiting for possible layout completion operation`);
            await this.bufferManager.waitForLayoutSync();
            // wait for possible change document events
            this.logger.debug(`${LOG_PREFIX}: Waiting for possible document change completion operation`);
            await this.changeManager.getDocumentChangeCompletionLock(textEditor.document);
            this.logger.debug(`${LOG_PREFIX}: Waiting done`);

            const winId = this.bufferManager.getWinIdForTextEditor(textEditor);
            const cursor = selections[0].active;

            this.logger.debug(
                `${LOG_PREFIX}: kind: ${kind}, WinId: ${winId}, cursor: [${cursor.line}, ${
                    cursor.character
                }], isMultiSelection: ${selections.length > 1}`,
            );
            if (!winId) {
                return;
            }
            const neovimCursorPos = this.neovimCursorPosition.get(textEditor);
            if (neovimCursorPos && neovimCursorPos.col === cursor.character && neovimCursorPos.line === cursor.line) {
                this.logger.debug(`${LOG_PREFIX}: Skipping event since neovim has same cursor pos`);
                return;
            }

            if (e.selections.length > 1 || !e.selections[0].active.isEqual(e.selections[0].anchor)) {
                if (e.kind !== TextEditorSelectionChangeKind.Mouse || !this.settings.mouseSelectionEnabled) {
                    return;
                } else {
                    const grid = this.bufferManager.getGridIdForWinId(winId);
                    this.logger.debug(`${LOG_PREFIX}: Processing multi-selection, gridId: ${grid}`);
                    const requests: [string, unknown[]][] = [];
                    if (!this.modeManager.isVisualMode && grid) {
                        // need to start visual mode from anchor char
                        const firstPos = e.selections[0].anchor;
                        const mouseClickPos = editorPositionToNeovimPosition(textEditor, firstPos);
                        this.logger.debug(
                            `${LOG_PREFIX}: Starting visual mode from: [${mouseClickPos[0]}, ${mouseClickPos[1]}]`,
                        );
                        requests.push([
                            "nvim_input_mouse",
                            // nvim_input_mouse is zero based while getNeovimCursorPosForEditor() returns 1 based line
                            ["left", "press", "", grid, mouseClickPos[0] - 1, mouseClickPos[1]],
                        ]);
                        requests.push(["nvim_input", ["v"]]);
                    }
                    const lastSelection = e.selections.slice(-1)[0];
                    if (!lastSelection) {
                        return;
                    }
                    const cursorPos = editorPositionToNeovimPosition(e.textEditor, lastSelection.active);
                    this.logger.debug(
                        `${LOG_PREFIX}: Updating cursor pos, winId: ${winId}, pos: [${cursorPos[0]}, ${cursorPos[1]}]`,
                    );
                    requests.push(["nvim_win_set_cursor", [winId, cursorPos]]);
                    await callAtomic(this.client, requests, this.logger, LOG_PREFIX);
                }
            } else {
                const cursorPos = getNeovimCursorPosFromEditor(textEditor);
                this.logger.debug(
                    `${LOG_PREFIX}: Updating cursor pos, winId: ${winId}, pos: [${cursorPos[0]}, ${cursorPos[1]}]`,
                );
                const requests: [string, unknown[]][] = [["nvim_win_set_cursor", [winId, cursorPos]]];
                await callAtomic(this.client, requests, this.logger, LOG_PREFIX);
            }
        },
        50,
        { leading: false, trailing: true },
    );

    /**
     * Update cursor in active editor. Coords are zero based
     */
    private updateCursorPosInEditor = (editor: TextEditor, newLine: number, newCol: number): void => {
        if (this.ignoreSelectionEvents) {
            return;
        }
        this.logger.debug(
            `${LOG_PREFIX}: Updating cursor in editor, viewColumn: ${editor.viewColumn}, pos: [${newLine}, ${newCol}]`,
        );
        const visibleRange = editor.visibleRanges[0];
        const revealCursor = new Selection(newLine, newCol, newLine, newCol);
        // if (!this.neovimCursorUpdates.has(editor)) {
        //     this.neovimCursorUpdates.set(editor, {});
        // }
        // this.neovimCursorUpdates.get(editor)![`${newLine}.${newCol}`] = true;
        editor.selections = [revealCursor];
        const visibleLines = visibleRange.end.line - visibleRange.start.line;
        // this.commitScrolling.cancel();
        if (visibleRange.contains(revealCursor)) {
            // always try to reveal even if in visible range to reveal horizontal scroll
            editor.revealRange(new Range(revealCursor.active, revealCursor.active), TextEditorRevealType.Default);
        } else if (revealCursor.active.line < visibleRange.start.line) {
            const revealType =
                visibleRange.start.line - revealCursor.active.line >= visibleLines / 2
                    ? TextEditorRevealType.Default
                    : TextEditorRevealType.AtTop;
            // this.textEditorsRevealing.set(editor, revealCursor.active.line);
            editor.revealRange(new Range(revealCursor.active, revealCursor.active), revealType);
            // vscode.commands.executeCommand("revealLine", { lineNumber: revealCursor.active.line, at: revealType });
        } else if (revealCursor.active.line > visibleRange.end.line) {
            const revealType =
                revealCursor.active.line - visibleRange.end.line >= visibleLines / 2
                    ? TextEditorRevealType.InCenter
                    : TextEditorRevealType.Default;
            // this.textEditorsRevealing.set(editor, revealCursor.active.line);
            editor.revealRange(new Range(revealCursor.active, revealCursor.active), revealType);
            // vscode.commands.executeCommand("revealLine", { lineNumber: revealCursor.active.line, at: revealType });
        }
    };

    private updateCursorStyle(modeName: string): void {
        const modeConf = this.cursorModes.get(modeName);
        if (!modeConf) {
            return;
        }
        for (const editor of window.visibleTextEditors) {
            if (modeConf.cursorShape === "block") {
                editor.options.cursorStyle = TextEditorCursorStyle.Block;
            } else if (modeConf.cursorShape === "horizontal") {
                editor.options.cursorStyle = TextEditorCursorStyle.Underline;
            } else {
                editor.options.cursorStyle = TextEditorCursorStyle.Line;
            }
        }
    }

    private multipleCursorFromVisualMode(
        append: boolean,
        visualMode: string,
        startLine: number,
        endLine: number,
        endCol: number,
        skipEmpty: boolean,
    ): void {
        if (!window.activeTextEditor) {
            return;
        }
        this.logger.debug(
            `${LOG_PREFIX}: Spawning multiple cursors from lines: [${startLine}, ${endLine}], endCol: ${endCol} mode: ${visualMode}, append: ${append}, skipEmpty: ${skipEmpty}`,
        );
        const currentCursorPos = window.activeTextEditor.selection.active;
        const startCol = currentCursorPos.character;
        const newSelections: Selection[] = [];
        const doc = window.activeTextEditor.document;
        for (let line = startLine; line <= endLine; line++) {
            const lineDef = doc.lineAt(line);
            // always skip empty lines for visual block mode
            if (lineDef.text.trim() === "" && (skipEmpty || visualMode !== "V")) {
                continue;
            }
            let char = 0;
            if (visualMode === "V") {
                char = append ? lineDef.range.end.character : lineDef.firstNonWhitespaceCharacterIndex;
            } else {
                char = append ? endCol : startCol;
            }
            this.logger.debug(`${LOG_PREFIX}: Multiple cursor at: [${line}, ${char}]`);
            newSelections.push(new Selection(line, char, line, char));
        }
        window.activeTextEditor.selections = newSelections;
    }
    // Following lines are enabling vim-style cursor follow on scroll
    // although it's working, unfortunately it breaks vscode jumplist when scrolling to definition from outline/etc
    // I think it's better ot have more-less usable jumplist than such minor feature at this feature request will be implemented (https://github.com/microsoft/vscode/issues/84351)
    // private onChangeVisibleRange = async (e: vscode.TextEditorVisibleRangesChangeEvent): Promise<void> => {
    //     if (e.textEditor !== vscode.window.activeTextEditor) {
    //         return;
    //     }
    //     const ranges = e.visibleRanges[0];
    //     if (!ranges) {
    //         return;
    //     }
    //     if (this.shouldIgnoreMouseSelection) {
    //         return;
    //     }
    //     const editorRevealLine = this.textEditorsRevealing.get(e.textEditor);
    //     if (editorRevealLine) {
    //         if (editorRevealLine < ranges.start.line || editorRevealLine > ranges.end.line) {
    //             return;
    //         }
    //         this.textEditorsRevealing.delete(e.textEditor);
    //     }
    //     if (!this.isInsertMode) {
    //         this.commitScrolling(e.textEditor);
    //     }
    // };

    // private commitScrolling = throttle(
    //     (e: vscode.TextEditor) => {
    //         if (vscode.window.activeTextEditor !== e) {
    //             return;
    //         }
    //         const cursor = e.selection.active;
    //         const visibleRange = e.visibleRanges[0];
    //         if (!visibleRange) {
    //             return;
    //         }
    //         let updateCursor = false;
    //         if (cursor.line > visibleRange.end.line) {
    //             updateCursor = true;
    //             e.selections = [
    //                 new vscode.Selection(
    //                     visibleRange.end.line,
    //                     cursor.character,
    //                     visibleRange.end.line,
    //                     cursor.character,
    //                 ),
    //             ];
    //         } else if (cursor.line < visibleRange.start.line) {
    //             updateCursor = true;
    //             e.selections = [
    //                 new vscode.Selection(
    //                     visibleRange.start.line,
    //                     cursor.character,
    //                     visibleRange.start.line,
    //                     cursor.character,
    //                 ),
    //             ];
    //         }
    //         if (updateCursor && e.viewColumn) {
    //             const winId = this.editorColumnIdToWinId.get(e.viewColumn);
    //             if (winId) {
    //                 this.updateCursorPositionInNeovim(winId, e.selection.active.line, e.selection.active.character);
    //             }
    //         }
    //     },
    //     500,
    //     { leading: false },
    // );
    // private commitScrollingFast = throttle(this.updateScreenRowFromScrolling, 200, { leading: false });
}
