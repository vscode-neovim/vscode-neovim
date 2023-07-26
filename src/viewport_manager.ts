import { NeovimClient } from "neovim";
import vscode, {
    Disposable,
    TextEditor,
    window,
    TextEditorVisibleRangesChangeEvent,
    TextEditorSelectionChangeEvent,
    Selection,
    TextEditorRevealType,
    Position,
} from "vscode";

import { Logger } from "./logger";
import { MainController } from "./main_controller";
import { NeovimExtensionRequestProcessable, NeovimRedrawProcessable } from "./neovim_events_processable";
import { callAtomic, getNeovimViewportPosFromEditor } from "./utils";

const LOG_PREFIX = "ViewportManager";
const SELECTION_CHANGED_WAIT_TIME = 10;
// https://github.com/microsoft/vscode/blob/380ad48e3240676b48d96343f8ad565d4fea8063/src/vs/editor/common/viewLayout/viewLayout.ts#L16
export const SMOOTH_SCROLLING_TIME = 125;

// all 0-indexed
export class Viewport {
    line = 0; // current line
    col = 0; // current col
    topline = 0; // top viewport line
    botline = 0; // bottom viewport line
    leftcol = 0; // left viewport col
    skipcol = 0; // skip col (maybe left col)
}

export enum VSCodeSynchronizableEvent {
    TextEditorVisibleRangesChangeEvent,
    TextEditorSelectionChangeEvent,
}

export class ViewportManager implements Disposable, NeovimRedrawProcessable, NeovimExtensionRequestProcessable {
    private disposables: Disposable[] = [];

    /**
     * Current grid viewport, indexed by grid
     */
    private gridViewport: Map<number, Viewport> = new Map();

    /**
     * Lock indicating whether vscode is currently scrolling
     */
    private vscodeScrollingLock: Thenable<void> = Promise.resolve();

    /**
     * Map of grids that received Scrolled notification to their scrolled view
     */
    private scrolledGrids: Map<number, Viewport> = new Map();

    /**
     * Map each text editor to pending viewport-related events (keeps only the last event)
     */
    private triggeredViewportEvents: Map<TextEditor, Map<VSCodeSynchronizableEvent, unknown>> = new Map();

    /**
     * Set of desynced viewport
     */
    private desyncedViewport: WeakSet<TextEditor> = new WeakSet();

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private main: MainController,
    ) {
        this.disposables.push(window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection));
        this.disposables.push(window.onDidChangeTextEditorVisibleRanges(this.onDidChangeTextEditorVisibleRanges));
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    /**
     * Get viewport data
     * @param gridId: grid id
     * @returns viewport data
     */
    public getViewport(gridId: number): Viewport {
        if (!this.gridViewport.has(gridId)) this.gridViewport.set(gridId, new Viewport());
        return this.gridViewport.get(gridId)!;
    }

    /**
     * @param gridId: grid id
     * @returns (0, 0)-indexed cursor position and flag indicating byte col
     */
    public getCursorFromViewport(gridId: number): Position {
        const view = this.getViewport(gridId);
        return new Position(view.line, view.col);
    }

    /**
     * @param gridId: grid id
     * @returns (0, 0)-indexed grid offset
     */
    public getGridOffset(gridId: number): Position {
        const view = this.getViewport(gridId);
        return new Position(view.topline, view.leftcol);
    }

    public async handleExtensionRequest(name: string, args: unknown[]): Promise<void> {
        switch (name) {
            case "window-scroll": {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const [winId, saveView] = args as [
                    number,
                    {
                        lnum: number;
                        col: number;
                        coladd: number;
                        curswant: number;
                        topline: number;
                        topfill: number;
                        leftcol: number;
                        skipcol: number;
                    },
                ];
                const gridId = this.main.bufferManager.getGridIdForWinId(winId);
                if (!gridId) {
                    this.logger.warn(`${LOG_PREFIX}: Unable to update scrolled view. No grid for winId: ${winId}`);
                    break;
                }
                const view = this.getViewport(gridId);
                view.leftcol = saveView.leftcol;
                view.skipcol = saveView.skipcol;
                this.scrolledGrids.set(gridId, view);
                break;
            }
        }
    }

    private onDidChangeTextEditorSelection = async (e: TextEditorSelectionChangeEvent): Promise<void> => {
        this.logger.debug(`${LOG_PREFIX}: SelectionChanged`);
        this.queueSyncViewportWithNeovim(e.textEditor, VSCodeSynchronizableEvent.TextEditorSelectionChangeEvent, e);
    };

    private onDidChangeTextEditorVisibleRanges = async (e: TextEditorVisibleRangesChangeEvent): Promise<void> => {
        this.logger.debug(`${LOG_PREFIX}: VisibleRangeChanged. New top line: ${e.visibleRanges[0].start.line}`);
        this.queueSyncViewportWithNeovim(e.textEditor, VSCodeSynchronizableEvent.TextEditorVisibleRangesChangeEvent, e);
    };

    private queueSyncViewportWithNeovim(
        textEditor: TextEditor,
        eventType: VSCodeSynchronizableEvent,
        e: unknown,
    ): void {
        if (this.main.modeManager.isInsertMode) {
            return;
        }
        const triggeredEvents = this.triggeredViewportEvents.get(textEditor);

        if (triggeredEvents) {
            triggeredEvents.set(eventType, e);
            return;
        }
        this.triggeredViewportEvents.set(textEditor, new Map([[eventType, e]]));
        this.syncViewportWithNeovim(textEditor);
    }

    private async syncViewportWithNeovim(textEditor: TextEditor): Promise<void> {
        // wait for possible layout updates first
        this.logger.debug(`${LOG_PREFIX}: Waiting for possible layout completion operation`);
        await this.main.bufferManager.waitForLayoutSync();
        // wait for possible change document events
        this.logger.debug(`${LOG_PREFIX}: Waiting for possible document change completion operation`);
        await this.main.changeManager.getDocumentChangeCompletionLock(textEditor.document);

        this.logger.debug(
            `${LOG_PREFIX}: Waiting ${SELECTION_CHANGED_WAIT_TIME} ms for combining possible multiple operations`,
        );
        await new Promise((resolve) => setTimeout(resolve, SELECTION_CHANGED_WAIT_TIME));

        const triggeredEvents = this.triggeredViewportEvents.get(textEditor);
        if (triggeredEvents?.has(VSCodeSynchronizableEvent.TextEditorVisibleRangesChangeEvent)) {
            const extra_wait_time = SMOOTH_SCROLLING_TIME + 1 - SELECTION_CHANGED_WAIT_TIME;
            this.logger.debug(
                `${LOG_PREFIX}: Waiting an extra ${extra_wait_time} ms for possible smooth scrolling event`,
            );
            await new Promise((resolve) => setTimeout(resolve, extra_wait_time));
        }

        this.logger.debug(`${LOG_PREFIX}: Waiting for vscode content scrolling`);
        await this.acquireScrollingLock();

        this.logger.debug(`${LOG_PREFIX}: Waiting done`);

        this.triggeredViewportEvents.delete(textEditor);
        if (!triggeredEvents) {
            return;
        }
        // record whether selection is changed in this synchronization for
        // forcing viewport update when necessary
        let selectionChanged = false;
        const requests: [string, unknown[]][] = [];
        for (const [eventType, e] of triggeredEvents) {
            switch (eventType) {
                case VSCodeSynchronizableEvent.TextEditorSelectionChangeEvent: {
                    this.logger.debug(`${LOG_PREFIX}: Scrolling neovim cursor`);
                    // await this.main.cursorManager.applySelectionChanged(e as TextEditorSelectionChangeEvent);
                    selectionChanged = true;
                    break;
                }
                case VSCodeSynchronizableEvent.TextEditorVisibleRangesChangeEvent: {
                    this.logger.debug(`${LOG_PREFIX}: Scrolling neovim viewport`);
                    this.scrollNeovim(textEditor, requests);
                    break;
                }
            }
        }

        if (selectionChanged && this.desyncedViewport.has(textEditor)) {
            this.logger.debug(`${LOG_PREFIX}: Forcing scrolling neovim viewport as it is not synced`);
            this.scrollNeovim(textEditor, requests);
        }

        if (requests.length) {
            await callAtomic(this.client, requests, this.logger, LOG_PREFIX);
        }
    }

    private scrollNeovim(editor: TextEditor | null, requests: [string, unknown[]][]): void {
        if (editor == null || this.main.modeManager.isInsertMode) {
            return;
        }
        const ranges = editor.visibleRanges;
        if (!ranges || ranges.length == 0 || ranges[0].end.line - ranges[0].start.line <= 1) {
            return;
        }

        // (1, 0)-indexed viewport tuple
        const viewport = getNeovimViewportPosFromEditor(editor);
        const gridId = this.main.bufferManager.getGridIdFromEditor(editor);
        const winId = this.main.bufferManager.getWinIdForTextEditor(editor);
        if (winId == null || gridId == null || !viewport) {
            return;
        }

        // (1, 0)-indexed cursor line
        const cursorLine = editor.selection.active.line + 1;
        if (cursorLine < viewport[0] || cursorLine > viewport[1]) {
            this.logger.debug(`${LOG_PREFIX}: Skipping scrolling neovim viewport as cursor is outside of viewport`);
            this.desyncedViewport.add(editor);
            return;
        }

        // (0, 0)-indexed start line
        const startLine = viewport[0] - 1;
        const offset = this.getGridOffset(gridId);
        if (offset && startLine != offset.line) {
            this.logger.debug(`${LOG_PREFIX}: Scrolling neovim viewport from ${offset.line} to ${startLine}`);
            this.desyncedViewport.delete(editor);
            requests.push(["nvim_execute_lua", ["vscode.scroll_viewport(...)", [winId, ...viewport]]]);
        }
    }

    private async acquireScrollingLock(): Promise<void> {
        let lock;
        do {
            lock = this.vscodeScrollingLock;
            await lock;
        } while (lock !== this.vscodeScrollingLock);
    }

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
        for (const [gridId, view] of this.scrolledGrids) {
            this.gridViewport.set(gridId, view);
        }
        for (const [name, ...args] of batch) {
            switch (name) {
                case "win_viewport": {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    for (const [grid, win, topline, botline, curline, curcol, line_count, scroll_delta] of args as [
                        number,
                        Window,
                        number,
                        number,
                        number,
                        number,
                        number,
                        number,
                    ][]) {
                        const view = this.getViewport(grid);
                        view.topline = topline;
                        view.botline = botline;
                        view.line = curline;
                        view.col = curcol;
                    }
                    break;
                }
                case "grid_destroy": {
                    for (const [grid] of args as [number][]) {
                        this.gridViewport.delete(grid);
                    }
                    break;
                }
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const [gridId, view] of this.scrolledGrids) {
            const editor = this.main.bufferManager.getEditorFromGridId(gridId);
            const ranges = editor?.visibleRanges;
            if (!ranges || ranges.length == 0 || ranges[ranges.length - 1].end.line - ranges[0].start.line <= 1) {
                break;
            }
            const startLine = ranges[0].start.line;
            const offset = this.getGridOffset(gridId);
            if (!offset) {
                break;
            }
            const newTopLine = offset.line;
            if (startLine === newTopLine) {
                break;
            }

            this.logger.debug(`${LOG_PREFIX}: Scrolling vscode viewport from ${startLine} to ${newTopLine}`);
            if (window.activeTextEditor === editor) {
                this.vscodeScrollingLock = vscode.commands
                    .executeCommand("revealLine", {
                        lineNumber: newTopLine,
                        at: "top",
                    })
                    .then(() => new Promise((resolve) => setTimeout(resolve, SMOOTH_SCROLLING_TIME + 1)));
            } else {
                const newPos = new Selection(newTopLine, 0, newTopLine, 0);
                editor.revealRange(newPos, TextEditorRevealType.AtTop);
            }
        }
        this.scrolledGrids.clear();
    }
}
