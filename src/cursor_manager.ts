import { debounce, DebouncedFunc } from "lodash-es";
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
import { NeovimExtensionRequestProcessable, NeovimRedrawProcessable } from "./neovim_events_processable";
import {
    callAtomic,
    convertEditorPositionToVimPosition,
    convertVimPositionToEditorPosition,
    ManualPromise,
} from "./utils";
import { Mode } from "./mode_manager";

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
    private neovimCursorPosition: WeakMap<TextEditor, Position> = new WeakMap();
    /**
     * Pending cursor update promise.
     * When switching modes with a cursor update (like entering insert mode with o), vim will send the mode change before it sends the cursor.
     * This promise is used by typing_manager to know when to unbind type handler. We are guaranteed to get a cursor update on `ModeChanged`.
     */
    public modeChangeCursorUpdatePromise: Map<TextEditor, ManualPromise> = new Map();
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

    private debouncedCursorUpdates: WeakMap<TextEditor, DebouncedFunc<CursorManager["updateCursorPosInEditor"]>> =
        new WeakMap();

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
            case "visual-changed": {
                const [winId] = args as [number];
                const gridId = this.main.bufferManager.getGridIdForWinId(winId);
                if (gridId) this.gridCursorUpdates.add(gridId);
                break;
            }
            case "visual-edit": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const [append, visualMode, startLine, endLine, startCol, endCol, skipEmpty] = args as any;
                this.multipleCursorFromVisualMode(
                    !!append,
                    new Mode(visualMode),
                    startLine - 1,
                    endLine - 1,
                    startCol,
                    endCol,
                    !!skipEmpty,
                );
                break;
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
        this.processCursorMoved();
    }

    private updateCursorStyle(modeName: string): void {
        const modeConf = this.cursorModes.get(modeName);
        if (!modeConf) {
            return;
        }
        for (const editor of window.visibleTextEditors) {
            if (modeName == "visual") {
                // in visual mode, we try to hide the cursor because we only use it for selections
                editor.options.cursorStyle = TextEditorCursorStyle.LineThin;
            } else if (modeConf.cursorShape === "block") {
                editor.options.cursorStyle = TextEditorCursorStyle.Block;
            } else if (modeConf.cursorShape === "horizontal") {
                editor.options.cursorStyle = TextEditorCursorStyle.Underline;
            } else {
                editor.options.cursorStyle = TextEditorCursorStyle.Line;
            }
        }
    }

    private onModeChange = (): void => {
        if (this.main.modeManager.isInsertMode) this.wantInsertCursorUpdate = true;
        this.modeChangeCursorUpdatePromise.get(window.activeTextEditor!)?.reject();
        this.modeChangeCursorUpdatePromise.set(window.activeTextEditor!, new ManualPromise());
    };

    private onDidChangeVisibleTextEditors = (): void => {
        this.updateCursorStyle(this.main.modeManager.currentMode.name);
    };

    /**
     * Called when cursor update received. Waits for document changes to complete and then updates cursor position in editor.
     */
    public processCursorMoved(): void {
        for (const gridId of this.gridCursorUpdates) {
            this.logger.debug(`${LOG_PREFIX}: Received cursor update from neovim, gridId: ${gridId}`);
            const editor = this.main.bufferManager.getEditorFromGridId(gridId);
            if (!editor) {
                this.logger.warn(`${LOG_PREFIX}: No editor for gridId: ${gridId}`);
                continue;
            }
            const cursor = this.main.viewportManager.getCursorFromViewport(gridId);
            if (!cursor) {
                this.logger.warn(`${LOG_PREFIX}: No cursor for gridId from viewport: ${gridId}`);
                continue;
            }

            // !For cursor updates tab is always counted as 1 col
            // Todo: investigate if needed with win_viewport
            // !For text changes neovim sends first buf_lines_event followed by redraw event
            // !But since changes are asynchronous and will happen after redraw event we need to wait for them first
            const docPromises = this.main.changeManager.getDocumentChangeCompletionLock(editor.document);
            if (docPromises) {
                this.logger.debug(
                    `${LOG_PREFIX}: Waiting for document change completion before setting the editor cursor`,
                );
                docPromises.then(() => {
                    const newPos = convertVimPositionToEditorPosition(editor, cursor);
                    this.getDebouncedUpdateCursorPos(editor)(editor, newPos);
                });
            } else {
                const newPos = convertVimPositionToEditorPosition(editor, cursor);
                this.getDebouncedUpdateCursorPos(editor).cancel();
                this.updateCursorPosInEditor(editor, newPos);
            }
        }
        this.gridCursorUpdates.clear();
    }

    // !Often, especially with complex multi-command operations, neovim sends multiple cursor updates in multiple batches
    // !To not mess the cursor, try to debounce the update
    private getDebouncedUpdateCursorPos = (
        editor: TextEditor,
    ): DebouncedFunc<CursorManager["updateCursorPosInEditor"]> => {
        const existing = this.debouncedCursorUpdates.get(editor);
        if (existing) return existing;
        const func = debounce(this.updateCursorPosInEditor, 10, { leading: false, trailing: true, maxWait: 50 });
        this.debouncedCursorUpdates.set(editor, func);
        return func;
    };

    /**
     * Update cursor in active editor. Creates visual selections if appropriate.
     */
    private updateCursorPosInEditor = async (editor: TextEditor, active: Position): Promise<void> => {
        if (
            this.main.modeManager.isInsertMode &&
            !this.wantInsertCursorUpdate &&
            !this.main.modeManager.isRecordingInInsertMode
        ) {
            this.logger.debug(`${LOG_PREFIX}: Skipping insert cursor update in editor`);
            return;
        }

        const prevActive = editor.selection.active;
        let selections;

        const mode = this.main.modeManager.currentMode;
        if (mode.isVisual) {
            this.logger.debug(
                `${LOG_PREFIX}: Creating visual selection, mode: ${mode.visual}, active: [${active.line}, ${active.character}]`,
            );
            selections = await this.createVisualSelection(editor, mode, active);
        } else {
            this.logger.debug(`${LOG_PREFIX}: Updating cursor in editor pos: [${active.line}, ${active.character}]`);
            selections = [new Selection(active, active)];
        }

        this.neovimCursorPosition.set(editor, selections[0].active);
        editor.selections = selections; // always update to clear visual selections
        if (!selections[0].active.isEqual(prevActive)) {
            this.triggerMovementFunctions(editor, active);
        }

        this.modeChangeCursorUpdatePromise.get(window.activeTextEditor!)?.resolve();
    };

    private onSelectionChanged = async (e: TextEditorSelectionChangeEvent): Promise<void> => {
        if (this.main.modeManager.isInsertMode) return;

        const { textEditor, kind } = e;
        // ! Note: Unfortunately navigating from outline is Command kind, so we can't skip it :(
        this.logger.debug(
            `${LOG_PREFIX}: onSelectionChanged, kind: ${kind}, editor: ${textEditor.document.uri.fsPath}, active: [${textEditor.selection.active.line}, ${textEditor.selection.active.character}]`,
        );

        // wait for possible layout updates first
        this.logger.debug(`${LOG_PREFIX}: Waiting for possible layout completion operation`);
        await this.main.bufferManager.waitForLayoutSync();
        // wait for possible change document events
        this.logger.debug(`${LOG_PREFIX}: Waiting for possible document change completion operation`);
        await this.main.changeManager.getDocumentChangeCompletionLock(textEditor.document);
        this.logger.debug(`${LOG_PREFIX}: Waiting done`);

        const documentChange = this.main.changeManager.getDocumentCursorAfterChange(textEditor.document);
        const cursor = textEditor.selection.active;
        if (documentChange && documentChange.isEqual(cursor)) {
            this.logger.debug(
                `${LOG_PREFIX}: Skipping onSelectionChanged event since it was selection produced by doc change`,
            );
            return;
        }

        this.applySelectionChanged(textEditor, kind);
        if (kind === TextEditorSelectionChangeKind.Mouse) this.applySelectionChanged.flush();
    };

    // ! Need to debounce requests because setting cursor by consequence of neovim event will trigger this method
    // ! and cursor may go out-of-sync and produce a jitter
    private applySelectionChanged = debounce(
        async (editor: TextEditor, kind: TextEditorSelectionChangeKind | undefined) => {
            this.main.changeManager.clearDocumentCursorAfterChange(editor.document);
            const selections = editor.selections;
            const selection = editor.selection;
            const cursor = selection.active;

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
                (selections.length > 1 && !this.main.modeManager.isVisualMode) ||
                (kind === TextEditorSelectionChangeKind.Mouse && !selection.active.isEqual(selection.anchor))
            ) {
                this.logger.debug(`${LOG_PREFIX}: Processing multi-selection`);
                if (kind === TextEditorSelectionChangeKind.Mouse && this.settings.mouseSelectionEnabled) {
                    if (!this.main.modeManager.isVisualMode) {
                        // need to start visual mode from anchor char
                        const firstPos = selection.anchor;
                        const mouseClickPos = convertEditorPositionToVimPosition(editor, firstPos);
                        this.logger.debug(
                            `${LOG_PREFIX}: Starting visual mode from: [${mouseClickPos.line}, ${mouseClickPos.character}]`,
                        );
                        await this.updateNeovimCursorPosition(editor, mouseClickPos);
                        await this.client.feedKeys("v", "nx", false);
                    }
                    const lastSelection = selections.slice(-1)[0];
                    if (!lastSelection) return;
                    cursorPos = convertEditorPositionToVimPosition(editor, lastSelection.active);
                } else {
                    return;
                }
            }
            await this.updateNeovimCursorPosition(editor, cursorPos);
        },
        100,
        { leading: false, trailing: true },
    );

    /**
     * Set cursor position in neovim. Coords are [0, 0] based. If no position provided, will use
     *  editor cursor position.
     */
    public async updateNeovimCursorPosition(editor: TextEditor, pos: Position | undefined): Promise<void> {
        const winId = this.main.bufferManager.getWinIdForTextEditor(editor);
        if (!winId) return;
        if (!pos) pos = convertEditorPositionToVimPosition(editor, editor.selection.active);
        this.logger.debug(
            `${LOG_PREFIX}: Updating cursor pos in neovim, winId: ${winId}, pos: [${pos.line}, ${pos.character}]`,
        );
        const vimPos = [pos.line + 1, pos.character]; // nvim_win_set_cursor is [1, 0] based
        const request: [string, unknown[]][] = [["nvim_win_set_cursor", [winId, vimPos]]];
        await callAtomic(this.client, request, this.logger, LOG_PREFIX);
    }

    // given a neovim visual selection range (and the current mode), create a vscode selection
    private createVisualSelection = async (editor: TextEditor, mode: Mode, active: Position): Promise<Selection[]> => {
        const doc = editor.document;

        const anchorNvim = await this.client.callFunction("getcharpos", ["v"]);
        const anchor = new Position(anchorNvim[1] - 1, anchorNvim[2] - 1);

        // to make a full selection, the end of the selection needs to be moved forward by one character
        // we hide the real cursor and use a highlight decorator for the fake cursor
        switch (mode.visual) {
            case "char":
                if (anchor.isBeforeOrEqual(active))
                    return [new Selection(anchor, new Position(active.line, active.character + 1))];
                else return [new Selection(new Position(anchor.line, anchor.character + 1), active)];
            case "line":
                if (anchor.line <= active.line)
                    return [new Selection(anchor.line, 0, active.line, doc.lineAt(active.line).text.length)];
                else return [new Selection(anchor.line, doc.lineAt(anchor.line).text.length, active.line, 0)];
            case "block": {
                const selections: Selection[] = [];
                // we want the first selection to be on the cursor line, so that a single-line selection will properly trigger word highlight
                const before = anchor.line < active.line;
                for (
                    let line = active.line;
                    before ? line >= anchor.line : line <= anchor.line;
                    before ? line-- : line++
                ) {
                    // skip lines that don't contain the block selection, except if it contains the cursor
                    const docLine = doc.lineAt(line);
                    if (
                        docLine.range.end.character > Math.min(anchor.character, active.character) ||
                        line === active.line
                    ) {
                        // selections go left to right for simplicity, and don't go past the end of the line
                        selections.push(
                            new Selection(
                                line,
                                Math.min(anchor.character, active.character),
                                line,
                                Math.min(Math.max(anchor.character, active.character) + 1, docLine.text.length),
                            ),
                        );
                    }
                }
                return selections;
            }
        }
    };

    private triggerMovementFunctions = (editor: TextEditor, pos: Position): void => {
        commands.executeCommand("editor.action.wordHighlight.trigger");

        const topVisibleLine = Math.min(...editor.visibleRanges.map((r) => r.start.line));
        const bottomVisibleLine = Math.max(...editor.visibleRanges.map((r) => r.end.line));
        const deltaLine = pos.line - editor.selection.active.line;
        const type =
            deltaLine > 0
                ? pos.line > bottomVisibleLine + 10
                    ? TextEditorRevealType.InCenterIfOutsideViewport
                    : TextEditorRevealType.Default
                : deltaLine < 0
                ? pos.line < topVisibleLine - 10
                    ? TextEditorRevealType.InCenterIfOutsideViewport
                    : TextEditorRevealType.Default
                : TextEditorRevealType.Default;
        editor.revealRange(new Selection(pos, pos), type);
        this.main.viewportManager.scrollNeovim(editor);
    };

    private multipleCursorFromVisualMode(
        append: boolean,
        mode: Mode,
        startLine: number,
        endLine: number,
        startCol: number,
        endCol: number,
        skipEmpty: boolean,
    ): void {
        if (!window.activeTextEditor) return;

        this.logger.debug(
            `${LOG_PREFIX}: Spawning multiple cursors from lines: [${startLine}, ${endLine}], col: [${startCol}, ${endCol}], mode: ${mode.visual}, append: ${append}, skipEmpty: ${skipEmpty}`,
        );
        const selections: Selection[] = [];
        const doc = window.activeTextEditor.document;
        for (let line = startLine; line <= endLine; line++) {
            const lineDef = doc.lineAt(line);
            // always skip empty lines for visual block mode
            if (lineDef.text.trim() === "" && (skipEmpty || mode.visual === "block")) continue;
            let char = 0;
            if (mode.visual === "line") {
                char = append ? lineDef.range.end.character : lineDef.firstNonWhitespaceCharacterIndex;
            } else {
                char = append ? endCol : startCol;
            }
            this.logger.debug(`${LOG_PREFIX}: Multiple cursor at: [${line}, ${char}]`);
            selections.push(new Selection(line, char, line, char));
        }
        window.activeTextEditor.selections = selections;
    }
}
