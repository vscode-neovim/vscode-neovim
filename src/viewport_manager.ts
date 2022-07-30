import { NeovimClient } from "neovim";
import { Disposable, TextEditor, window, TextEditorVisibleRangesChangeEvent } from "vscode";

import { BufferManager } from "./buffer_manager";
import { Logger } from "./logger";
import { NeovimExtensionRequestProcessable, NeovimRedrawProcessable } from "./neovim_events_processable";

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

export class ViewportManager implements Disposable, NeovimRedrawProcessable, NeovimExtensionRequestProcessable {
    private disposables: Disposable[] = [];

    /**
     * Current grid viewport, indexed by grid
     */
    private gridViewport: Map<number, WinView> = new Map();

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private bufferManager: BufferManager,
        private neovimViewportHeightExtend: number,
    ) {
        this.disposables.push(window.onDidChangeTextEditorVisibleRanges(this.onDidChangeVisibleRange));
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
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
                this.gridViewport.set(gridId, view);
            }
        }
    }

    public scrollNeovim(editor: TextEditor | null): void {
        if (editor == null) {
            return;
        }
        const ranges = editor.visibleRanges;
        if (!ranges || ranges.length == 0 || ranges[0].end.line - ranges[0].start.line <= 1) {
            return;
        }
        const startLine = ranges[0].start.line + 1 - this.neovimViewportHeightExtend;
        // when it have fold we need get the last range. it need add 1 line on multiple fold
        const endLine = ranges[ranges.length - 1].end.line + ranges.length + this.neovimViewportHeightExtend;
        const currentLine = editor.selection.active.line;

        const gridId = this.bufferManager.getGridIdFromEditor(editor);
        if (gridId == null) {
            return;
        }
        const viewport = this.gridViewport.get(gridId);
        if (viewport && startLine != viewport?.topline && currentLine == viewport?.lnum - 1) {
            this.client.executeLua("vscode.scroll_viewport(...)", [Math.max(startLine, 0), endLine]);
        }
    }

    private onDidChangeVisibleRange = async (e: TextEditorVisibleRangesChangeEvent): Promise<void> => {
        this.scrollNeovim(e.textEditor);
    };

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
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
    }
}
