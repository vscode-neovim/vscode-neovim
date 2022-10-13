import { debounce } from "lodash-es";
import { NeovimClient } from "neovim";
import {
    commands,
    Disposable,
    Position,
    Selection,
    TextEditor,
    TextEditorCursorStyle,
    TextEditorRevealType,
    TextEditorSelectionChangeEvent,
    TextEditorSelectionChangeKind,
    window,
} from "vscode";

import { Logger } from "./logger";
import { MainController } from "./main_controller";
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
    implements Disposable, NeovimRedrawProcessable, NeovimExtensionRequestProcessable, NeovimRangeCommandProcessable
{
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
    private neovimCursorPosition: WeakMap<TextEditor, Position> = new WeakMap();
    /**
     * Special workaround flag to ignore editor selection events
     */
    private ignoreSelectionEvents = false;
    /**
     * In insert mode, cursor updates can be sent due to document changes. We should ignore them to
     * avoid interfering with vscode typing. However, they are important for various actions, such as
     * cursor updates while entering insert mode and insert mode commands. Thus, when those events occur,
     * this flag is used to disable ignoring the update. This is set to true when entering insert
     * mode or running insert mode command, and set to false before document updates in insert mode.
     */
    public wantInsertCursorUpdate = true;
    /**
     * Set of grid that needs to undergo cursor update
     */
    private gridCursorUpdates: Set<number> = new Set();

    private debouncedCursorUpdates: WeakMap<TextEditor, CursorManager["updateCursorPosInEditor"]> = new WeakMap();

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private main: MainController,
        private settings: CursorManagerSettings,
    ) {
        this.disposables.push(window.onDidChangeTextEditorSelection(this.onSelectionChanged));
        this.disposables.push(window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors));
        this.main.modeManager.onModeChange(this.onModeChange);
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
                const gridId = this.main.bufferManager.getGridIdForWinId(winId);
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
            const editor = this.main.bufferManager.getEditorFromGridId(gridId);
            if (!editor) {
                this.logger.warn(`${LOG_PREFIX}: No editor for gridId: ${gridId}`);
                continue;
            }
            const cursorPos = this.main.viewportManager.getCursorFromViewport(gridId);
            if (!cursorPos) {
                this.logger.warn(`${LOG_PREFIX}: No cursor for gridId from viewport: ${gridId}`);
                continue;
            }
            // !For text changes neovim sends first buf_lines_event followed by redraw event
            // !But since changes are asynchronous and will happen after redraw event we need to wait for them first
            const docPromises = this.main.changeManager.getDocumentChangeCompletionLock(editor.document);
            if (docPromises) {
                this.logger.debug(
                    `${LOG_PREFIX}: Waiting for document change completion before setting the cursor, gridId: ${gridId}, pos: [${cursorPos.line}, ${cursorPos.col}]`,
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
                        this.neovimCursorPosition.set(editor, new Position(cursorPos.line, finalCol));
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
                    this.neovimCursorPosition.set(editor, new Position(cursorPos.line, finalCol));
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
        this.updateCursorStyle(this.main.modeManager.currentMode);
    };

    private onSelectionChanged = async (e: TextEditorSelectionChangeEvent): Promise<void> => {
        if (this.main.modeManager.isInsertMode) {
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
        await this.main.bufferManager.waitForLayoutSync();
        // wait for possible change document events
        this.logger.debug(`${LOG_PREFIX}: Waiting for possible document change completion operation`);
        await this.main.changeManager.getDocumentChangeCompletionLock(textEditor.document);
        this.logger.debug(`${LOG_PREFIX}: Waiting done`);

        const documentChange = this.main.changeManager.eatDocumentCursorAfterChange(textEditor.document);
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
        async (editor: TextEditor, kind: TextEditorSelectionChangeKind | undefined) => {
            const cursor = editor.selection.active;
            const selections = editor.selections;
            const selection = editor.selection;

            this.logger.debug(
                `${LOG_PREFIX}: Applying changed selection, kind: ${kind},  cursor: [${cursor.line}, ${
                    cursor.character
                }], isMultiSelection: ${selections.length > 1}`,
            );
            const neovimCursorPos = this.neovimCursorPosition.get(editor);
            if (neovimCursorPos && neovimCursorPos.isEqual(cursor)) {
                this.logger.debug(`${LOG_PREFIX}: Skipping event since neovim has same cursor pos`);
                return;
            }

            let cursorPos;
            if (
                selections.length > 1 ||
                (kind === TextEditorSelectionChangeKind.Mouse && !selection.active.isEqual(selection.anchor))
            ) {
                this.logger.debug(`${LOG_PREFIX}: Processing multi-selection`);
                if (kind === TextEditorSelectionChangeKind.Mouse) {
                    if (!this.main.modeManager.isVisualMode && this.settings.mouseSelectionEnabled) {
                        // need to start visual mode from anchor char
                        const firstPos = selections[0].anchor;
                        const mouseClickPos = editorPositionToNeovimPosition(editor, firstPos);
                        this.logger.debug(
                            `${LOG_PREFIX}: Starting visual mode from: [${mouseClickPos[0]}, ${mouseClickPos[1]}]`,
                        );
                        await this.updateNeovimCursorPosition(editor, mouseClickPos);
                        await this.client.feedKeys("v", "nx", false);
                    }
                    const lastSelection = selections.slice(-1)[0];
                    if (!lastSelection) return;
                    cursorPos = editorPositionToNeovimPosition(editor, lastSelection.active);
                } else {
                    return;
                }
            }
            await this.updateNeovimCursorPosition(editor, cursorPos);
        },
        20,
        { leading: false, trailing: true },
    );

    /**
     * Set cursor position in neovim. Coords are [1, 0] based. If no position provided, will use
     *  editor cursor position.
     */
    public async updateNeovimCursorPosition(editor: TextEditor, pos: [number, number] | undefined): Promise<void> {
        const winId = this.main.bufferManager.getWinIdForTextEditor(editor);
        if (!winId) return;
        if (!pos) pos = getNeovimCursorPosFromEditor(editor);
        this.logger.debug(`${LOG_PREFIX}: Updating cursor pos in neovim, winId: ${winId}, pos: [${pos[0]}, ${pos[1]}]`);
        const request: [string, unknown[]][] = [["nvim_win_set_cursor", [winId, pos]]];
        await callAtomic(this.client, request, this.logger, LOG_PREFIX);
    }

    /**
     * Update cursor in active editor. Coords are zero based
     */
    private updateCursorPosInEditor = (editor: TextEditor, newLine: number, newCol: number): void => {
        if (
            this.ignoreSelectionEvents ||
            (this.main.modeManager.isInsertMode &&
                !this.wantInsertCursorUpdate &&
                !this.main.modeManager.isRecordingInInsertMode)
        ) {
            this.logger.debug(`${LOG_PREFIX}: Skipping cursor update in editor`);
            return;
        }
        const editorName = `${editor.document.uri.toString()}, viewColumn: ${editor.viewColumn}`;
        this.logger.debug(`${LOG_PREFIX}: Updating cursor in editor: ${editorName}, pos: [${newLine}, ${newCol}]`);
        const currCursor = editor.selection.active;
        const deltaLine = newLine - currCursor.line;
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
        this.main.viewportManager.scrollNeovim(editor);
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
        if (this.main.modeManager.isInsertMode) this.wantInsertCursorUpdate = true;

        if (newMode === "normal" && window.activeTextEditor && window.activeTextEditor.selections.length > 1) {
            window.activeTextEditor.selections = [
                new Selection(window.activeTextEditor.selection.active, window.activeTextEditor.selection.active),
            ];
        }
    };
}
