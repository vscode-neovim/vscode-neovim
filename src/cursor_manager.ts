import { NeovimClient, Window } from "neovim";
import {
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
import { NeovimExtensionRequestProcessable, NeovimRedrawProcessable } from "./neovim_events_processable";
import { editorPositionToNeovimPosition, getNeovimCursorPosFromEditor } from "./utils";

const LOG_PREFIX = "CursorManager";

export interface CursorManagerSettings {
    mouseSelectionEnabled: boolean;
}

interface CursorInfo {
    cursorShape: "block" | "horizontal" | "vertical";
}

export class CursorManager implements Disposable, NeovimRedrawProcessable, NeovimExtensionRequestProcessable {
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
                const [append, visualMode, startLine1Based, endLine1Based, skipEmpty] = args as any;
                this.multipleCursorFromVisualMode(
                    !!append,
                    visualMode,
                    startLine1Based - 1,
                    endLine1Based - 1,
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
            this.neovimCursorPosition.set(editor, { line: cursorPos.line, col: cursorPos.col });
            // !For text changes neovim sends first buf_lines_event followed by redraw event
            // !But since changes are asynchronous and will happen after redraw event we need to wait for them first
            const queueUpdate = async (): Promise<void> => {
                await this.changeManager.getDocumentChangeCompletionLock(editor.document);
                this.updateCursorPosInEditor(editor, cursorPos.line, cursorPos.col);
            };
            queueUpdate();
        }
        winCursorsUpdates.clear();
    }

    private onDidChangeVisibleTextEditors = (): void => {
        this.updateCursorStyle(this.modeManager.currentMode);
    };

    private onSelectionChanged = async (e: TextEditorSelectionChangeEvent): Promise<void> => {
        if (this.modeManager.isInsertMode) {
            return;
        }
        const { textEditor, kind, selections } = e;
        this.logger.debug(`${LOG_PREFIX}: SelectionChanged`);

        // wait for possible layout updates first
        this.logger.debug(`${LOG_PREFIX}: Waiting for possible layout completion operation`);
        await this.bufferManager.waitForLayoutSync();
        // wait for possible change document events
        this.logger.debug(`${LOG_PREFIX}: Waiting for possible document change completion operation`);
        await this.changeManager.getDocumentChangeCompletionLock(textEditor.document);

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
                this.client.callAtomic(requests);
            }
        } else {
            const createJumpEntry =
                (!e.kind || e.kind === TextEditorSelectionChangeKind.Command) &&
                e.textEditor === window.activeTextEditor;

            const cursorPos = getNeovimCursorPosFromEditor(textEditor);
            this.logger.debug(
                `${LOG_PREFIX}: Updating cursor pos, winId: ${winId}, pos: [${cursorPos[0]}, ${cursorPos[1]}], createJumpEntry: ${createJumpEntry}`,
            );
            // const skipJump = this.skipJumpsForUris.get(e.textEditor.document.uri.toString());
            // if (skipJump) {
            //     createJumpEntry = false;
            //     this.skipJumpsForUris.delete(e.textEditor.document.uri.toString());
            // }
            const requests: [string, unknown[]][] = [["nvim_win_set_cursor", [winId, cursorPos]]];
            if (createJumpEntry) {
                requests.push(["nvim_call_function", ["VSCodeStoreJumpForWin", [winId]]]);
            }
            await this.client.callAtomic(requests);
        }
    };

    /**
     * Update cursor in active editor. Coords are zero based
     */
    private updateCursorPosInEditor = (editor: TextEditor, newLine: number, newCol: number): void => {
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
        skipEmpty: boolean,
    ): void {
        if (!window.activeTextEditor) {
            return;
        }
        this.logger.debug(
            `${LOG_PREFIX}: Spawning multiple cursors from lines: [${startLine}, ${endLine}], mode: ${visualMode}, append: ${append}, skipEmpty: ${skipEmpty}`,
        );
        const currentCursorPos = window.activeTextEditor.selection.active;
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
                char = append ? currentCursorPos.character + 1 : currentCursorPos.character;
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
