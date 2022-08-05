import { debounce } from "lodash-es";
import { NeovimClient } from "neovim";
import {
    commands,
    Disposable,
    Selection,
    TextEditor,
    TextEditorCursorStyle,
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
    editorPositionToNeovimPosition,
    getNeovimCursorPosFromEditor,
} from "./utils";
import { ViewportManager } from "./viewport_manager";

const LOG_PREFIX = "CursorManager";

export interface CursorManagerSettings {
    mouseSelectionEnabled: boolean;
}

interface CursorInfo {
    cursorShape: "block" | "horizontal" | "vertical";
}

export class CursorManager
    implements Disposable, NeovimRedrawProcessable, NeovimExtensionRequestProcessable, NeovimRangeCommandProcessable
{
    private disposables: Disposable[] = [];
    /**
     * Vim cursor mode mappings
     */
    private cursorModes: Map<string, CursorInfo> = new Map();
    /**
     * Special workaround flag to ignore editor selection events
     */
    private ignoreSelectionEvents = false;
    /**
     * Set of grid that needs to undergo cursor update
     */
    private gridCursorUpdates: Set<number> = new Set();

    private debouncedCursorUpdates: WeakMap<TextEditor, CursorManager["updateCursorPosInEditor"]> = new WeakMap();

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private modeManager: ModeManager,
        private bufferManager: BufferManager,
        private changeManager: DocumentChangeManager,
        private viewportManager: ViewportManager,
        private settings: CursorManagerSettings,
    ) {
        this.viewportManager.registerSelectionHandler(this.applySelectionChanged);
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
            case "window-scroll": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const [winId] = args as [number, any];
                const gridId = this.bufferManager.getGridIdForWinId(winId);
                if (gridId) {
                    this.gridCursorUpdates.add(gridId);
                }
            }
        }
    }

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
        for (const [name, ...args] of batch) {
            const firstArg = args[0] || [];
            switch (name) {
                case "grid_cursor_goto": {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    for (const [grid, row, col] of args as [number, number, number][]) {
                        this.gridCursorUpdates.add(grid);
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
                        this.gridCursorUpdates.add(grid);
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
        for (const gridId of this.gridCursorUpdates) {
            this.logger.debug(`${LOG_PREFIX}: Received cursor update from neovim, gridId: ${gridId}`);
            const editor = this.bufferManager.getEditorFromGridId(gridId);
            if (!editor) {
                this.logger.warn(`${LOG_PREFIX}: No editor for gridId: ${gridId}`);
                continue;
            }
            const cursorPos = this.viewportManager.getCursorFromViewport(gridId);
            if (!cursorPos) {
                this.logger.warn(`${LOG_PREFIX}: No cursor for gridId from viewport: ${gridId}`);
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
                        const finalCol = calculateEditorColFromVimScreenCol(
                            editor.document.lineAt(cursorPos.line).text,
                            cursorPos.col,
                            // !For cursor updates tab is always counted as 1 col
                            cursorPos.isByteCol ? 1 : (editor.options.tabSize as number),
                            cursorPos.isByteCol,
                        );
                        // !Often, especially with complex multi-command operations, neovim sends multiple cursor updates in multiple batches
                        // !To not mess the cursor, try to debounce the update
                        this.getDebouncedUpdateCursorPos(editor)(editor, cursorPos.line, finalCol);
                    } catch (e) {
                        this.logger.warn(`${LOG_PREFIX}: ${(e as Error).message}`);
                    }
                });
            } else {
                // !Sync call helps with most common operations latency
                this.logger.debug(`${LOG_PREFIX}: No pending document changes, gridId: ${gridId}`);
                try {
                    const finalCol = calculateEditorColFromVimScreenCol(
                        editor.document.lineAt(cursorPos.line).text,
                        cursorPos.col,
                        cursorPos.isByteCol ? 1 : (editor.options.tabSize as number),
                        cursorPos.isByteCol,
                    );
                    this.updateCursorPosInEditor(editor, cursorPos.line, finalCol);
                } catch (e) {
                    this.logger.warn(`${LOG_PREFIX}: ${(e as Error).message}`);
                }
            }
        }
        this.gridCursorUpdates.clear();
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

    public applySelectionChanged = (e: TextEditorSelectionChangeEvent, requests: [string, unknown[]][]): void => {
        const textEditor = e.textEditor;
        const kind = e.kind;
        const winId = this.bufferManager.getWinIdForTextEditor(textEditor);
        const cursor = textEditor.selection.active;
        const selections = textEditor.selections;

        if (this.ignoreSelectionEvents) {
            return;
        }

        const documentChange = this.changeManager.eatDocumentCursorAfterChange(textEditor.document);
        if (documentChange && documentChange.line === cursor.line && documentChange.character === cursor.character) {
            this.logger.debug(
                `${LOG_PREFIX}: Skipping onSelectionChanged event since it was selection produced by doc change`,
            );
            return;
        }

        this.logger.debug(
            `${LOG_PREFIX}: Applying changed selection, kind: ${kind}, WinId: ${winId}, cursor: [${cursor.line}, ${
                cursor.character
            }], isMultiSelection: ${textEditor.selections.length > 1}`,
        );
        if (!winId) {
            return;
        }
        const gridId = this.bufferManager.getGridIdForWinId(winId);
        const neovimCursorPos = gridId ? this.viewportManager.getCursorFromViewport(gridId) : null;
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
                if (!this.modeManager.isVisualMode && grid) {
                    // need to start visual mode from anchor char
                    const firstPos = selections[0].anchor;
                    const mouseClickPos = editorPositionToNeovimPosition(textEditor, firstPos);
                    this.logger.debug(
                        `${LOG_PREFIX}: Starting visual mode from: [${mouseClickPos[0]}, ${mouseClickPos[1]}]`,
                    );
                    requests.push(["nvim_win_set_cursor", [winId, mouseClickPos]]);
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
            }
        } else {
            const cursorPos = getNeovimCursorPosFromEditor(textEditor);
            this.logger.debug(
                `${LOG_PREFIX}: Updating cursor pos in neovim, winId: ${winId}, pos: [${cursorPos[0]}, ${cursorPos[1]}]`,
            );
            requests.push(["nvim_win_set_cursor", [winId, cursorPos]]);
        }
    };

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
        this.logger.debug(`${LOG_PREFIX}: Editor: ${editorName} setting cursor directly`);
        const newPos = new Selection(newLine, newCol, newLine, newCol);
        if (!editor.selection.isEqual(newPos)) {
            editor.selections = [newPos];
            commands.executeCommand("editor.action.wordHighlight.trigger");
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
}
