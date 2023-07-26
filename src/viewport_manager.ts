import { NeovimClient } from "neovim";
import { Disposable, TextEditor, window, TextEditorVisibleRangesChangeEvent, Position } from "vscode";

import { Logger } from "./logger";
import { MainController } from "./main_controller";
import { NeovimExtensionRequestProcessable, NeovimRedrawProcessable } from "./neovim_events_processable";

const LOG_PREFIX = "ViewportManager";

// all 0-indexed
export class Viewport {
    line = 0; // current line
    col = 0; // current col
    topline = 0; // top viewport line
    botline = 0; // bottom viewport line
    leftcol = 0; // left viewport col
    skipcol = 0; // skip col (maybe left col)
}

export class ViewportManager implements Disposable, NeovimRedrawProcessable, NeovimExtensionRequestProcessable {
    private disposables: Disposable[] = [];

    /**
     * Current grid viewport, indexed by grid
     */
    private gridViewport: Map<number, Viewport> = new Map();

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private main: MainController,
        private neovimViewportHeightExtend: number,
    ) {
        this.disposables.push(window.onDidChangeTextEditorVisibleRanges(this.onDidChangeVisibleRange));
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
                break;
            }
        }
    }

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
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
    }

    private onDidChangeVisibleRange = async (e: TextEditorVisibleRangesChangeEvent): Promise<void> => {
        this.scrollNeovim(e.textEditor);
    };

    public scrollNeovim(editor: TextEditor | null): void {
        if (editor == null || this.main.modeManager.isInsertMode) {
            return;
        }
        const ranges = editor.visibleRanges;
        if (!ranges || ranges.length == 0 || ranges[0].end.line - ranges[0].start.line <= 1) {
            return;
        }
        const startLine = ranges[0].start.line - this.neovimViewportHeightExtend;
        // when it have fold we need get the last range. it need add 1 line on multiple fold
        const endLine = ranges[ranges.length - 1].end.line + ranges.length + this.neovimViewportHeightExtend;
        const currentLine = editor.selection.active.line;

        const gridId = this.main.bufferManager.getGridIdFromEditor(editor);
        if (gridId == null) {
            return;
        }
        const viewport = this.gridViewport.get(gridId);
        if (viewport && startLine != viewport?.topline && currentLine == viewport?.line) {
            this.client.executeLua("require('vscode.api').scroll_viewport(...)", [Math.max(startLine, 0), endLine]);
        }
    }
}
