import { debounce } from "lodash-es";
import { NeovimClient } from "neovim";
import vscode, {
    Disposable,
    TextEditor,
    window,
    TextEditorVisibleRangesChangeEvent,
    TextEditorSelectionChangeEvent,
} from "vscode";

import { BufferManager } from "./buffer_manager";
import { DocumentChangeManager } from "./document_change_manager";
import { Logger } from "./logger";
import { ModeManager } from "./mode_manager";
import { NeovimExtensionRequestProcessable, NeovimRedrawProcessable } from "./neovim_events_processable";
import { callAtomic, getNeovimViewportPosFromEditor } from "./utils";

const LOG_PREFIX = "ViewportManager";

export interface WinView {
    lnum: number;
    col: number;
    coladd: number;
    curswant: number;
    topline: number;
    topfill: number;
    leftcol: number;
    skipcol: number;
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
    private gridViewport: Map<number, WinView> = new Map();

    /**
     * Lock indicating whether vscode is currently scrolling
     */
    private vscodeScrollingLock: Promise<void> = Promise.resolve();

    /**
     * Map of grids that received Scrolled notification to their scrolled view
     */
    private scrolledGrids: Map<number, WinView> = new Map();

    /**
     * Map each text editor to pending viewport-related events (keeps only the last event)
     */
    private triggeredViewportEvents: Map<TextEditor, Map<VSCodeSynchronizableEvent, unknown>> = new Map();

    /**
     * Handlers for `DidChangeTextEditorSelection`
     */
    private selectionHandlers: ((e: TextEditorSelectionChangeEvent, requests: [string, unknown[]][]) => void)[] = [];

    /**
     * Set of desynced viewport
     */
    private desyncedViewport: WeakSet<TextEditor> = new WeakSet();

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private bufferManager: BufferManager,
        private modeManager: ModeManager,
        private changeManager: DocumentChangeManager,
    ) {
        this.disposables.push(window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection));
        this.disposables.push(window.onDidChangeTextEditorVisibleRanges(this.onDidChangeTextEditorVisibleRanges));
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    /**
     * Registers a handler on `DidChangeTextEditorSelection` event. Fires when
     * viewport-related pending events are resolved
     * @param f handler for selection event
     */
    public registerSelectionHandler(
        f: (e: TextEditorSelectionChangeEvent, requests: [string, unknown[]][]) => void,
    ): void {
        this.selectionHandlers.push(f);
    }

    /**
     * @param gridId: grid id
     * @returns (0, 0)-indexed cursor position and flag indicating byte col
     */
    public getCursorFromViewport(gridId: number): { line: number; col: number; isByteCol: boolean } | undefined {
        const view = this.gridViewport.get(gridId);
        if (!view) {
            return;
        }
        return { line: view.lnum - 1, col: view.col, isByteCol: true };
    }

    /**
     * @param gridId: grid id
     * @returns (0, 0)-indexed grid offset
     */
    public getGridOffset(gridId: number): { topLine: number; leftCol: number } | undefined {
        const view = this.gridViewport.get(gridId);
        if (!view) {
            return;
        }
        return { topLine: view.topline - 1, leftCol: view.leftcol };
    }

    public async handleExtensionRequest(name: string, args: unknown[]): Promise<void> {
        switch (name) {
            case "window-scroll": {
                const [winId, view] = args as [number, WinView];
                const gridId = this.bufferManager.getGridIdForWinId(winId);
                if (!gridId) {
                    this.logger.warn(`${LOG_PREFIX}: Unable to update scrolled view. No gird for winId: ${winId}`);
                    break;
                }
                this.scrolledGrids.set(gridId, view);
            }
        }
    }

    private onDidChangeTextEditorSelection = async (e: TextEditorSelectionChangeEvent): Promise<void> => {
        this.logger.debug(`${LOG_PREFIX}: SelectionChanged`);
        this.queueViewportSync(e.textEditor, VSCodeSynchronizableEvent.TextEditorSelectionChangeEvent, e);
    };

    private onDidChangeTextEditorVisibleRanges = async (e: TextEditorVisibleRangesChangeEvent): Promise<void> => {
        this.logger.debug(`${LOG_PREFIX}: VisibleRangeChanged. New top line: ${e.visibleRanges[0].start.line}`);
        this.queueViewportSync(e.textEditor, VSCodeSynchronizableEvent.TextEditorVisibleRangesChangeEvent, e);
    };

    private queueViewportSync = async (
        textEditor: TextEditor,
        eventType: VSCodeSynchronizableEvent,
        e: unknown,
    ): Promise<void> => {
        if (this.modeManager.isInsertMode) {
            return;
        }
        const queue = this.triggeredViewportEvents.get(textEditor);

        if (queue) {
            queue.set(eventType, e);
            return;
        }
        this.triggeredViewportEvents.set(textEditor, new Map([[eventType, e]]));

        // wait for possible layout updates first
        this.logger.debug(`${LOG_PREFIX}: Waiting for possible layout completion operation`);
        await this.bufferManager.waitForLayoutSync();
        // wait for possible change document events
        this.logger.debug(`${LOG_PREFIX}: Waiting for possible document change completion operation`);
        await this.changeManager.getDocumentChangeCompletionLock(textEditor.document);

        this.logger.debug(`${LOG_PREFIX}: Waiting 20 ms for possible multiple operations`);

        this.syncViewportWithNeovim(textEditor);
    };

    private syncViewportWithNeovim = debounce(
        async (textEditor: TextEditor) => {
            this.logger.debug(`${LOG_PREFIX}: Waiting for vscode content scrolling`);
            await this.acquireScrollingLock();
            this.logger.debug(`${LOG_PREFIX}: Waiting done`);
            const triggeredEvents = this.triggeredViewportEvents.get(textEditor);
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
                        for (const handler of this.selectionHandlers) {
                            handler(<TextEditorSelectionChangeEvent>e, requests);
                        }
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
        },
        20,
        { leading: false, trailing: true },
    );

    private scrollNeovim(editor: TextEditor | null, requests: [string, unknown[]][]): void {
        if (editor == null || this.modeManager.isInsertMode) {
            return;
        }
        const ranges = editor.visibleRanges;
        if (!ranges || ranges.length == 0 || ranges[0].end.line - ranges[0].start.line <= 1) {
            return;
        }

        // (1, 0)-indexed viewport tuple
        const viewport = getNeovimViewportPosFromEditor(editor);
        const gridId = this.bufferManager.getGridIdFromEditor(editor);
        const winId = this.bufferManager.getWinIdForTextEditor(editor);
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
        if (offset && startLine != offset.topLine) {
            this.logger.debug(`${LOG_PREFIX}: Scrolling neovim viewport from ${offset.topLine} to ${startLine}`);
            const view = this.gridViewport.get(gridId);
            if (view) {
                view.topline = viewport[0];
            }
            this.desyncedViewport.delete(editor);
            requests.push(["nvim_execute_lua", ["vscode.scroll_viewport(...)", [winId, ...viewport]]]);
        }
    }

    private queueScrollingCommands(f: () => PromiseLike<void>): void {
        this.vscodeScrollingLock = this.vscodeScrollingLock.then(f);
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
                    for (const [grid, win, topline, botline, curline, curcol] of args as [
                        number,
                        Window,
                        number,
                        number,
                        number,
                        number,
                    ][]) {
                        if (!this.gridViewport.has(grid)) {
                            this.logger.debug(
                                `${LOG_PREFIX}: No existing view for gridId: ${grid}, initializing a new one...`,
                            );
                            const view = {
                                lnum: 1,
                                leftcol: 0,
                                col: 0,
                                topfill: 0,
                                topline: 1,
                                coladd: 0,
                                skipcol: 0,
                                curswant: 0,
                            };
                            this.gridViewport.set(grid, view);
                        }
                        const view = this.gridViewport.get(grid)!;
                        view.topline = topline + 1;
                        view.lnum = curline + 1;
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
            const editor = this.bufferManager.getEditorFromGridId(gridId);
            const ranges = editor?.visibleRanges;
            if (!ranges || ranges.length == 0 || ranges[0].end.line - ranges[0].start.line <= 1) {
                break;
            }
            const startLine = ranges[0].start.line;
            const offset = this.getGridOffset(gridId);
            if (!offset) {
                break;
            }
            const newTopLine = offset.topLine;
            if (startLine === newTopLine) {
                break;
            }

            this.logger.debug(`${LOG_PREFIX}: Scrolling vscode viewport from ${startLine} to ${newTopLine}`);
            this.queueScrollingCommands(async (): Promise<void> => {
                return vscode.commands.executeCommand("revealLine", { lineNumber: newTopLine, at: "top" });
            });
        }
        this.scrolledGrids.clear();
    }
}
