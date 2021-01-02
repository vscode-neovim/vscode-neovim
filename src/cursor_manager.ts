import { debounce } from "lodash-es";
import { NeovimClient, Window } from "neovim";
import {
    commands,
    Disposable,
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
    /**
     * Current grid viewport boundaries
     */
    private gridVisibleViewport: Map<number, { top: number; bottom: number }> = new Map();

    private debouncedCursorUpdates: WeakMap<TextEditor, CursorManager["updateCursorPosInEditor"]> = new WeakMap();

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
        this.modeManager.onModeChange(this.onModeChange);
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
        const gridCursorUpdates: Map<
            number,
            { line: number; col: number; grid: number; isScreenCol: boolean }
        > = new Map();
        const gridCursorViewportHint: Map<number, { line: number; col: number }> = new Map();
        // need to process win_viewport events first
        for (const [name, ...args] of batch) {
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
                        this.gridVisibleViewport.set(grid, { top: topline, bottom: botline });
                        gridCursorViewportHint.set(grid, { line: curline, col: curcol });
                    }
                    break;
                }
            }
        }
        for (const [name, ...args] of batch) {
            const firstArg = args[0] || [];
            switch (name) {
                case "grid_cursor_goto": {
                    for (const [grid, row, col] of args as [number, number, number][]) {
                        const viewportHint = gridCursorViewportHint.get(grid);
                        // leverage viewport hint if available. It may be NOT available and go in different batch
                        if (viewportHint) {
                            gridCursorUpdates.set(grid, {
                                grid,
                                line: viewportHint.line,
                                col: viewportHint.col,
                                isScreenCol: true,
                            });
                        } else {
                            const topline = this.gridVisibleViewport.get(grid)?.top || 0;
                            gridCursorUpdates.set(grid, { grid, line: topline + row, col, isScreenCol: false });
                        }
                    }
                    break;
                }
                // nvim may not send grid_cursor_goto and instead uses grid_scroll along with grid_line
                // If we received it we must shift current cursor position by given rows
                case "grid_scroll": {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    for (const [grid, top, bot, left, right, rows, cols] of args as [
                        number,
                        number,
                        number,
                        null,
                        number,
                        number,
                        number,
                    ][]) {
                        // When changing pos via grid scroll there must be always win_viewport event, leverage it
                        const viewportHint = gridCursorViewportHint.get(grid);
                        if (viewportHint) {
                            gridCursorUpdates.set(grid, {
                                grid,
                                line: viewportHint.line,
                                col: viewportHint.col,
                                isScreenCol: true,
                            });
                        }
                    }
                    break;
                }
                case "grid_destroy": {
                    for (const [grid] of args as [number][]) {
                        this.gridVisibleViewport.delete(grid);
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
        for (const [gridId, cursorPos] of gridCursorUpdates) {
            this.logger.debug(
                `${LOG_PREFIX}: Received cursor update from neovim, gridId: ${gridId}, pos: [${cursorPos.line}, ${cursorPos.col}]`,
            );
            const editor = this.bufferManager.getEditorFromGridId(gridId);
            if (!editor) {
                this.logger.warn(`${LOG_PREFIX}: No editor for gridId: ${gridId}`);
                continue;
            }
            // !For text changes neovim sends first buf_lines_event followed by redraw event
            // !But since changes are asynchronous and will happen after redraw event we need to wait for them first
            const docPromises = this.changeManager.getDocumentChangeCompletionLock(editor.document);
            if (docPromises) {
                this.logger.debug(
                    `${LOG_PREFIX}: Waiting for document change completion before setting the cursor, gridId: ${gridId}`,
                );
                docPromises.then(() => {
                    try {
                        this.logger.debug(`${LOG_PREFIX}: Waiting document change completion done, gridId: ${gridId}`);
                        const finalCol = cursorPos.isScreenCol
                            ? calculateEditorColFromVimScreenCol(
                                  editor.document.lineAt(cursorPos.line).text,
                                  cursorPos.col,
                                  // !For cursor updates tab is always counted as 1 col
                                  1,
                                  true,
                              )
                            : cursorPos.col;
                        this.neovimCursorPosition.set(editor, { line: cursorPos.line, col: finalCol });
                        // !Often, especially with complex multi-command operations, neovim sends multiple cursor updates in multiple batches
                        // !To not mess the cursor, try to debounce the update
                        this.getDebouncedUpdateCursorPos(editor)(editor, cursorPos.line, finalCol);
                    } catch (e) {
                        this.logger.warn(`${LOG_PREFIX}: ${e.message}`);
                    }
                });
            } else {
                // !Sync call helps with most common operations latency
                this.logger.debug(`${LOG_PREFIX}: No pending document changes, gridId: ${gridId}`);
                try {
                    const finalCol = cursorPos.isScreenCol
                        ? calculateEditorColFromVimScreenCol(
                              editor.document.lineAt(cursorPos.line).text,
                              cursorPos.col,
                              1,
                              true,
                          )
                        : cursorPos.col;
                    this.neovimCursorPosition.set(editor, { line: cursorPos.line, col: finalCol });
                    this.updateCursorPosInEditor(editor, cursorPos.line, finalCol);
                } catch (e) {
                    this.logger.warn(`${LOG_PREFIX}: ${e.message}`);
                }
            }
        }
        gridCursorUpdates.clear();
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

    private onSelectionChanged = async (e: TextEditorSelectionChangeEvent): Promise<void> => {
        if (this.modeManager.isInsertMode) {
            return;
        }
        if (this.ignoreSelectionEvents) {
            return;
        }
        const { textEditor, kind } = e;
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

        const documentChange = this.changeManager.eatDocumentCursorAfterChange(textEditor.document);
        const cursor = textEditor.selection.active;
        if (documentChange && documentChange.line === cursor.line && documentChange.character === cursor.character) {
            this.logger.debug(
                `${LOG_PREFIX}: Skipping onSelectionChanged event since it was selection produced by doc change`,
            );
            return;
        }

        this.applySelectionChanged(textEditor, kind);
    };

    // ! Need to debounce requests because setting cursor by consequence of neovim event will trigger this method
    // ! and cursor may go out-of-sync and produce a jitter
    private applySelectionChanged = debounce(
        async (textEditor: TextEditor, kind: TextEditorSelectionChangeKind | undefined) => {
            const winId = this.bufferManager.getWinIdForTextEditor(textEditor);
            const cursor = textEditor.selection.active;
            const selections = textEditor.selections;

            this.logger.debug(
                `${LOG_PREFIX}: Applying changed selection, kind: ${kind}, WinId: ${winId}, cursor: [${cursor.line}, ${
                    cursor.character
                }], isMultiSelection: ${textEditor.selections.length > 1}`,
            );
            if (!winId) {
                return;
            }
            const neovimCursorPos = this.neovimCursorPosition.get(textEditor);
            if (neovimCursorPos && neovimCursorPos.col === cursor.character && neovimCursorPos.line === cursor.line) {
                this.logger.debug(`${LOG_PREFIX}: Skipping event since neovim has same cursor pos`);
                return;
            }

            if (
                selections.length > 1 ||
                (kind === TextEditorSelectionChangeKind.Mouse && !selections[0].active.isEqual(selections[0].anchor)) ||
                this.modeManager.isVisualMode
            ) {
                if (kind !== TextEditorSelectionChangeKind.Mouse || !this.settings.mouseSelectionEnabled) {
                    return;
                } else {
                    const grid = this.bufferManager.getGridIdForWinId(winId);
                    this.logger.debug(`${LOG_PREFIX}: Processing multi-selection, gridId: ${grid}`);
                    const requests: [string, unknown[]][] = [];
                    if (!this.modeManager.isVisualMode && grid) {
                        // need to start visual mode from anchor char
                        const firstPos = selections[0].anchor;
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
                    const lastSelection = selections.slice(-1)[0];
                    if (!lastSelection) {
                        return;
                    }
                    const cursorPos = editorPositionToNeovimPosition(textEditor, lastSelection.active);
                    this.logger.debug(
                        `${LOG_PREFIX}: Updating cursor pos in neovim, winId: ${winId}, pos: [${cursorPos[0]}, ${cursorPos[1]}]`,
                    );
                    requests.push(["nvim_win_set_cursor", [winId, cursorPos]]);
                    await callAtomic(this.client, requests, this.logger, LOG_PREFIX);
                }
            } else {
                const cursorPos = getNeovimCursorPosFromEditor(textEditor);
                this.logger.debug(
                    `${LOG_PREFIX}: Updating cursor pos in neovim, winId: ${winId}, pos: [${cursorPos[0]}, ${cursorPos[1]}]`,
                );
                const requests: [string, unknown[]][] = [["nvim_win_set_cursor", [winId, cursorPos]]];
                await callAtomic(this.client, requests, this.logger, LOG_PREFIX);
            }
        },
        20,
        { leading: false, trailing: true },
    );

    /**
     * Update cursor in active editor. Coords are zero based
     */
    private updateCursorPosInEditor = (editor: TextEditor, newLine: number, newCol: number): void => {
        if (this.ignoreSelectionEvents) {
            return;
        }
        const editorName = `${editor.document.uri.toString()}, viewColumn: ${editor.viewColumn}`;
        this.logger.debug(`${LOG_PREFIX}: Updating cursor in editor: ${editorName}, pos: [${newLine}, ${newCol}]`);
        if (editor !== window.activeTextEditor) {
            this.logger.debug(
                `${LOG_PREFIX}: Editor: ${editorName} is not active text editor, setting cursor directly`,
            );
            const newPos = new Selection(newLine, newCol, newLine, newCol);
            if (!editor.selection.isEqual(newPos)) {
                editor.selections = [newPos];
            }
            return;
        }
        const currCursor = editor.selection.active;
        const deltaLine = newLine - currCursor.line;
        let deltaChar = newCol - currCursor.character;
        if (Math.abs(deltaLine) <= 1) {
            this.logger.debug(`${LOG_PREFIX}: Editor: ${editorName} using cursorMove command`);
            if (Math.abs(deltaLine) > 0) {
                if (newCol !== currCursor.character) {
                    deltaChar = newCol;
                    commands.executeCommand("cursorLineStart");
                } else {
                    deltaChar = 0;
                }
                commands.executeCommand("cursorMove", {
                    to: deltaLine > 0 ? "down" : "up",
                    by: "line",
                    value: Math.abs(deltaLine),
                    select: false,
                });
            }
            if (Math.abs(deltaChar) > 0) {
                if (Math.abs(deltaLine) > 0) {
                    this.logger.debug(`${LOG_PREFIX}: Editor: ${editorName} Moving cursor by char: ${deltaChar}`);
                    commands.executeCommand("cursorMove", {
                        to: deltaChar > 0 ? "right" : "left",
                        by: "character",
                        value: Math.abs(deltaChar),
                        select: false,
                    });
                } else {
                    this.logger.debug(
                        `${LOG_PREFIX}: Editor: ${editorName} setting cursor directly since zero line delta`,
                    );
                    const newPos = new Selection(newLine, newCol, newLine, newCol);
                    if (!editor.selection.isEqual(newPos)) {
                        editor.selections = [newPos];
                        editor.revealRange(newPos, TextEditorRevealType.Default);
                        commands.executeCommand("editor.action.wordHighlight.trigger");
                    }
                }
            }
        } else {
            this.logger.debug(`${LOG_PREFIX}: Editor: ${editorName} setting cursor directly`);
            const newPos = new Selection(newLine, newCol, newLine, newCol);
            if (!editor.selection.isEqual(newPos)) {
                editor.selections = [newPos];
                const topVisibleLine = Math.min(...editor.visibleRanges.map((r) => r.start.line));
                const bottomVisibleLine = Math.max(...editor.visibleRanges.map((r) => r.end.line));
                const type =
                    deltaLine > 0
                        ? newLine > bottomVisibleLine + 10
                            ? TextEditorRevealType.InCenterIfOutsideViewport
                            : TextEditorRevealType.Default
                        : deltaLine < 0
                        ? newLine < topVisibleLine - 10
                            ? TextEditorRevealType.InCenterIfOutsideViewport
                            : TextEditorRevealType.Default
                        : TextEditorRevealType.Default;
                editor.revealRange(newPos, type);
                commands.executeCommand("editor.action.wordHighlight.trigger");
            }
        }
    };

    private getDebouncedUpdateCursorPos = (editor: TextEditor): CursorManager["updateCursorPosInEditor"] => {
        const existing = this.debouncedCursorUpdates.get(editor);
        if (existing) {
            return existing;
        }
        const func = debounce(this.updateCursorPosInEditor, 10, { leading: false, trailing: true, maxWait: 100 });
        this.debouncedCursorUpdates.set(editor, func);
        return func;
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

    private onModeChange = (newMode: string): void => {
        if (newMode === "normal" && window.activeTextEditor && window.activeTextEditor.selections.length > 1) {
            window.activeTextEditor.selections = [
                new Selection(window.activeTextEditor.selection.active, window.activeTextEditor.selection.active),
            ];
        }
    };

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
