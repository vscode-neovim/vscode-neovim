import { debounce, DebouncedFunc } from "lodash";
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
    workspace,
} from "vscode";

import actions from "./actions";
import { config } from "./config";
import { eventBus, EventBusData } from "./eventBus";
import { createLogger } from "./logger";
import { MainController } from "./main_controller";
import {
    convertEditorPositionToVimPosition,
    convertVimPositionToEditorPosition,
    disposeAll,
    ManualPromise,
    rangesToSelections,
} from "./utils";
import { PendingUpdates } from "./utils/pending_updates";

const logger = createLogger("CursorManager", false);

interface CursorInfo {
    cursorShape: "block" | "horizontal" | "vertical";
}

export class CursorManager implements Disposable {
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
    private neovimCursorPosition: WeakMap<TextEditor, Selection> = new WeakMap();
    /**
     * Pending cursor update promise.
     * This promise is used by typing_manager to know when to unbind type handler.
     */
    private cursorUpdatePromise: Map<TextEditor, ManualPromise> = new Map();
    /**
     * Pending apply selection changed promise.
     * This promise is used by typing_manager to know when to unbind type handler.
     */
    private applySelectionChangedPromise: Map<TextEditor, ManualPromise> = new Map();
    /**
     * In insert mode, cursor updates can be sent due to document changes. We should ignore them to
     * avoid interfering with vscode typing. However, they are important for various actions, such as
     * cursor updates while entering insert mode and insert mode commands. Thus, when those events occur,
     * this flag is used to disable ignoring the update. This is set to true when entering insert
     * mode or running insert mode command, and set to false before document updates in insert mode.
     *
     * The flag corresponds to each `TextEditor`
     */
    private _wantInsertCursorUpdate: WeakMap<TextEditor, boolean> = new WeakMap();
    public wantInsertCursorUpdate = (editor: TextEditor) => this._wantInsertCursorUpdate.get(editor) ?? false;
    public setWantInsertCursorUpdate = (editor: TextEditor | undefined, want: boolean) => {
        if (!editor) return;
        if (want) this._wantInsertCursorUpdate.set(editor, want);
        else this._wantInsertCursorUpdate.delete(editor);
    };

    /**
     * Set of grids that needs to undergo cursor update
     */
    private gridCursorUpdates: PendingUpdates<number> = new PendingUpdates();

    private debouncedCursorUpdates: WeakMap<TextEditor, DebouncedFunc<CursorManager["updateCursorPosInEditor"]>> =
        new WeakMap();

    // Different change kinds use different debounce times
    private debouncedApplySelectionChanged: Map<number, DebouncedFunc<CursorManager["applySelectionChanged"]>> =
        new Map();
    // A flag indicates that func still pending.
    private previousApplyDebounceTime: number | undefined;

    private get client() {
        return this.main.client;
    }

    // To avoid executing after being disposed, save the timeouts and clear them upon disposal
    private updateCursorStyleTimeouts = new Set<NodeJS.Timeout>();

    public constructor(private main: MainController) {
        const updateCursorStyle = () => {
            this.updateCursorStyle();
            // Sometimes the cursor is reset to the default style.
            // Currently, can reproduce this issue when jumping between cells in Notebook.
            const timeout = setTimeout(() => {
                this.updateCursorStyle();
                this.updateCursorStyleTimeouts.delete(timeout);
            }, 100);
            this.updateCursorStyleTimeouts.add(timeout);
        };
        this.disposables.push(
            window.onDidChangeTextEditorSelection(this.onSelectionChanged),
            window.onDidChangeVisibleTextEditors(updateCursorStyle),
            window.onDidChangeActiveTextEditor(updateCursorStyle),
            eventBus.on("redraw", this.handleRedraw, this),
            eventBus.on("flush-redraw", this.handleRedrawFlush, this),
            eventBus.on("visual-changed", ([winId]) => {
                const gridId = this.main.bufferManager.getGridIdForWinId(winId);
                if (gridId) this.gridCursorUpdates.addForceUpdate(gridId);
            }),
            main.viewportManager.onCursorChanged((grid) => this.gridCursorUpdates.addForceUpdate(grid)),
            // Reset the cursor style
            new Disposable(() => {
                this.updateCursorStyleTimeouts.forEach((t) => clearTimeout(t));
                const styleName = workspace
                    .getConfiguration("editor")
                    .get("cursorStyle", "line")
                    .split("-")
                    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
                    .join("");
                const style = TextEditorCursorStyle[styleName as any];
                window.visibleTextEditors.forEach((e) => (e.options.cursorStyle = style as any));
            }),
        );
    }

    private handleRedraw({ name, args }: EventBusData<"redraw">): void {
        switch (name) {
            case "grid_cursor_goto": {
                args.forEach((arg) => this.gridCursorUpdates.addForceUpdate(arg[0]));
                break;
            }
            // nvim may not send grid_cursor_goto and instead uses grid_scroll along with grid_line
            // If we received it we must shift current cursor position by given rows
            case "grid_scroll": {
                args.forEach((arg) => this.gridCursorUpdates.addForceUpdate(arg[0]));
                break;
            }
            case "mode_info_set": {
                args.forEach((arg) =>
                    arg[1].forEach((mode) => {
                        if (mode.name && mode.cursor_shape) {
                            this.cursorModes.set(mode.name, { cursorShape: mode.cursor_shape });
                        }
                    }),
                );
                break;
            }
            case "mode_change": {
                if (this.main.modeManager.isInsertMode) {
                    this.setWantInsertCursorUpdate(window.activeTextEditor, true);
                }
                args.forEach((arg) => this.updateCursorStyle(arg[0]));
                break;
            }
        }
    }

    private handleRedrawFlush(): void {
        this.processCursorMoved();
        this.gridCursorUpdates.clear();
    }

    public async waitForCursorUpdate(editor: TextEditor): Promise<unknown> {
        return Promise.all([
            Promise.resolve(this.cursorUpdatePromise.get(editor)?.promise),
            Promise.resolve(this.applySelectionChangedPromise.get(editor)?.promise),
        ]);
    }

    private updateCursorStyle(modeName: string = this.main.modeManager.currentMode.name): void {
        const modeConf = this.cursorModes.get(modeName);
        if (!modeConf) {
            return;
        }
        let style: TextEditorCursorStyle;
        if (modeName === "visual") {
            // in visual mode, we try to hide the cursor because we only use it for selections
            style = TextEditorCursorStyle.LineThin;
        } else if (modeConf.cursorShape === "block") {
            style = TextEditorCursorStyle.Block;
        } else if (modeConf.cursorShape === "horizontal") {
            style = TextEditorCursorStyle.Underline;
        } else {
            style = TextEditorCursorStyle.Line;
        }
        for (const editor of window.visibleTextEditors) {
            editor.options.cursorStyle = style;
        }
    }

    /**
     * Called when cursor update received. Waits for document changes to complete and then updates cursor position in editor.
     */
    private processCursorMoved(): void {
        for (const [gridId, shouldUpdate] of this.gridCursorUpdates.entries()) {
            if (!shouldUpdate()) {
                continue;
            }

            logger.debug(`Received cursor update from neovim, gridId: ${gridId}`);
            const editor = this.main.bufferManager.getEditorFromGridId(gridId);
            if (!editor) {
                logger.warn(`No editor for gridId: ${gridId}`);
                continue;
            }
            // lock typing in editor until cursor update is complete
            if (!this.cursorUpdatePromise.has(editor)) this.cursorUpdatePromise.set(editor, new ManualPromise());
            this.getDebouncedUpdateCursorPos(editor)(editor, gridId);
        }
    }

    // !Often, especially with complex multi-command operations, neovim sends multiple cursor updates in multiple batches
    // !To not mess the cursor, try to debounce the update
    private getDebouncedUpdateCursorPos = (
        editor: TextEditor,
    ): DebouncedFunc<CursorManager["updateCursorPosInEditor"]> => {
        const existing = this.debouncedCursorUpdates.get(editor);
        if (existing) return existing;
        const func = debounce(this.updateCursorPosInEditor, 5, { leading: false, trailing: true, maxWait: 10 });
        this.debouncedCursorUpdates.set(editor, func);
        return func;
    };

    /**
     * Update cursor in active editor. Creates visual selections if appropriate.
     */
    public updateCursorPosInEditor = async (editor: TextEditor, gridId: number): Promise<void> => {
        // !For text changes neovim sends first buf_lines_event followed by redraw event
        // !But since changes are asynchronous and will happen after redraw event we need to wait for them first
        logger.debug(`Waiting for document change completion before setting the editor cursor`);
        await this.main.changeManager.getDocumentChangeCompletionLock(editor.document);

        if (
            this.main.modeManager.isInsertMode &&
            !this.wantInsertCursorUpdate(editor) &&
            !this.main.modeManager.isRecordingInInsertMode
        ) {
            logger.debug(`Skipping insert cursor update in editor`);
            this.cursorUpdatePromise.get(editor)?.resolve();
            this.cursorUpdatePromise.delete(editor);
            return;
        }

        const bytePos = this.main.viewportManager.getCursorFromViewport(gridId);
        const nvimActivePos = convertVimPositionToEditorPosition(editor, bytePos);

        let selections: Selection[] = [];
        if (!this.main.modeManager.isVisualMode) {
            selections = [new Selection(nvimActivePos, nvimActivePos)];
        } else {
            const win = this.main.bufferManager.getWinIdForTextEditor(editor);
            if (!win) {
                logger.warn(`No window for editor`);
                return;
            }
            try {
                const ranges = await actions.lua("get_selections", win);
                selections = rangesToSelections(ranges, editor.document);
            } catch (e) {
                logger.error(e);
                return;
            }
        }

        const { selections: prevSelections } = editor;
        if (
            // Avoid unnecessary selections updates, or it will disrupt cursor movement related features in vscode
            selections.length !== prevSelections.length ||
            selections.some(
                (s, idx) =>
                    !(s.active.isEqual(prevSelections[idx].active) && s.anchor.isEqual(prevSelections[idx].anchor)),
            )
        ) {
            editor.selections = selections;
        }
        // Store cursor position to reduce cursor synchronization
        this.neovimCursorPosition.set(editor, selections[0]);
        // note: Same selections can have different anchor and active positions
        if (!selections[0].active.isEqual(prevSelections[0].active)) {
            // 1. In normal mode, nvimActivePos equals to selections[0].active
            // 2. nvimActivePos is always the active position that we want to reveal
            this.triggerMovementFunctions(editor, nvimActivePos);
        }

        this.cursorUpdatePromise.get(editor)?.resolve();
        this.cursorUpdatePromise.delete(editor);
    };

    private onSelectionChanged = (e: TextEditorSelectionChangeEvent): void => {
        if (this.main.modeManager.isInsertMode) return;

        const { textEditor, kind } = e;
        // ! Note: Unfortunately navigating from outline is Command kind, so we can't skip it :(
        logger.debug(
            `onSelectionChanged, kind: ${kind}, editor: ${textEditor.document.uri.fsPath}, active: [${textEditor.selection.active.line}, ${textEditor.selection.active.character}]`,
        );

        // when dragging mouse, pre-emptively hide cursor to not clash with fake cursor
        if (kind === TextEditorSelectionChangeKind.Mouse && !textEditor.selection.isEmpty) {
            this.updateCursorStyle("visual");
        }

        // Why no wait when selection is empty?
        // 1. Waiting during cursor movement causes lag, especially in nvim with "cursorMove" command.
        // 2. Issues may arise only when selected region changes, needing visual selection sync in nvim.
        //    e.g. confusion from simultaneous insert mode entry and visual region sync due to simulated input.
        // Waiting theoretically necessary but can lead to other problems.
        // However, most things work fine without waiting before adding the mechanism.
        // Thus, no wait when selection is empty.
        if (!textEditor.selection.isEmpty && !this.applySelectionChangedPromise.has(textEditor))
            this.applySelectionChangedPromise.set(textEditor, new ManualPromise());
        this.getDebouncedApplySelectionChanged(kind)(textEditor, kind);
    };

    // ! Need to debounce requests because setting cursor by consequence of neovim event will trigger this method
    // ! and cursor may go out-of-sync and produce a jitter
    private getDebouncedApplySelectionChanged = (
        kind: TextEditorSelectionChangeKind | undefined,
    ): DebouncedFunc<CursorManager["applySelectionChanged"]> => {
        let debounceTime: number;
        // Should use same debounce time if previous debounced func still in progress
        // This avoid multiple cursor updates with different positions at the same time
        if (this.previousApplyDebounceTime !== undefined) {
            debounceTime = this.previousApplyDebounceTime;
        } else if (kind === TextEditorSelectionChangeKind.Mouse) {
            debounceTime = config.mouseSelectionDebounceTime;
        } else {
            debounceTime = config.normalSelectionDebounceTime;
        }
        this.previousApplyDebounceTime = debounceTime;

        let func = this.debouncedApplySelectionChanged.get(debounceTime);
        if (func) return func;
        func = debounce(this.applySelectionChanged, debounceTime, { leading: false, trailing: true });
        this.debouncedApplySelectionChanged.set(debounceTime, func);
        return func;
    };

    public applySelectionChanged = async (editor: TextEditor, kind?: TextEditorSelectionChangeKind): Promise<void> => {
        // reset cursor style if needed
        this.updateCursorStyle(this.main.modeManager.currentMode.name);

        // wait for possible layout updates first
        logger.debug(`Waiting for possible layout completion operation`);
        await this.main.bufferManager.waitForLayoutSync();
        // wait for possible change document events
        logger.debug(`Waiting for possible document change completion operation`);
        await this.main.changeManager.getDocumentChangeCompletionLock(editor.document);
        await this.main.changeManager.documentChangeLock.waitForUnlock();
        logger.debug(`Waiting done`);

        // ignore selection change caused by buffer edit
        const selection = editor.selection;
        const documentChange = this.main.changeManager.eatDocumentCursorAfterChange(editor.document);
        if (documentChange && documentChange.isEqual(selection.active)) {
            logger.debug(`Skipping onSelectionChanged event since it was selection produced by doc change`);
        } else {
            logger.debug(
                `Applying changed selection, kind: ${kind},  cursor: [${selection.active.line}, ${
                    selection.active.character
                }], isMultiSelection: ${editor.selections.length > 1}`,
            );

            if (selection.isEmpty) {
                if (this.main.modeManager.isVisualMode) await this.client.input("<Esc>");
                await this.updateNeovimCursorPosition(editor, selection.active);
            } else {
                if (kind !== TextEditorSelectionChangeKind.Mouse || !config.disableMouseSelection)
                    await this.updateNeovimVisualSelection(editor, selection);
            }
        }

        this.previousApplyDebounceTime = undefined;
        this.applySelectionChangedPromise.get(editor)?.resolve();
        this.applySelectionChangedPromise.delete(editor);
    };

    /**
     * Set cursor position in neovim. Coords are [0, 0] based.
     **/
    public async updateNeovimCursorPosition(
        editor: TextEditor,
        active: Position,
        skipSameCursorUpdate = true,
    ): Promise<void> {
        const winId = this.main.bufferManager.getWinIdForTextEditor(editor);
        if (!winId) return;
        const neovimCursorPos = this.neovimCursorPosition.get(editor);
        if (skipSameCursorUpdate && neovimCursorPos && neovimCursorPos.active.isEqual(active)) {
            logger.debug(`Skipping event since neovim has same cursor pos`);
            return;
        }
        const pos = convertEditorPositionToVimPosition(editor, active);
        logger.debug(`Updating cursor pos in neovim, winId: ${winId}, pos: [${pos.line}, ${pos.character}]`);
        const vimPos = [pos.line + 1, pos.character]; // nvim_win_set_cursor is [1, 0] based
        try {
            await this.client.request("nvim_win_set_cursor", [winId, vimPos]); // a little faster
        } catch (e) {
            // 1. The document content may be out of sync due to the rapid changes in content.
            //    When initializing the buffer, the output may be constantly updating.
            // 2. The document is a textEditor, but it cannot accept input, it's meaningless to use the extension.
            // In the document, going out-of-sync and cursor position errors are not significant.
            if (!config.autoGeneratedDocumentSchemes.includes(editor.document.uri.scheme)) {
                logger.error(`${(e as Error).message}`);
            }
        }
    }

    private async updateNeovimVisualSelection(editor: TextEditor, selection: Selection): Promise<void> {
        if (this.main.modeManager.isInsertMode) return;
        const winId = this.main.bufferManager.getWinIdForTextEditor(editor);
        if (!winId) return;
        const bufId = this.main.bufferManager.getBufferIdForTextDocument(editor.document);
        if (!bufId) return;
        const neovimCursorPos = this.neovimCursorPosition.get(editor);
        if (neovimCursorPos?.isEqual(selection)) {
            logger.debug(`Skipping event since neovim has same visual pos`);
            return;
        }
        const anchor = selection.anchor;
        const active = selection.active;
        await actions.lua(
            "start_visual",
            bufId,
            { line: anchor.line, character: anchor.character },
            { line: active.line, character: active.character },
        );
    }

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

    public dispose(): void {
        disposeAll(this.disposables);
    }
}
