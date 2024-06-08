import { WaitGroup } from "@jpwilliams/waitgroup";
import { DebouncedFunc, debounce } from "lodash";
import { Disposable, TextEditor, window } from "vscode";

import { EventBusData, VimHighlightUIAttributes, eventBus } from "./eventBus";
import { HighlightGroupStore } from "./highlights";
import { HighlightGrid, VimCell } from "./highlights/highlight_grid";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";

const VisibleRangesChangeDebounce = 200;

export class HighlightManager implements Disposable {
    private disposables: Disposable[] = [];
    private redrawWaitGroup = new WaitGroup();

    // Manages the highlight groups
    private groupStore: HighlightGroupStore;
    // Map of gridId -> HighlightGrid
    private highlightGrids: Map<number, HighlightGrid> = new Map();
    // Set of gridIds that need to be refreshed
    private staleGrids: Set<number> = new Set();
    // Debounce refresh decorations on visibleRanges change events.
    private debouncedRefreshOptions: Map<number, DebouncedFunc<(editor: TextEditor) => void>> = new Map();

    public constructor(private main: MainController) {
        this.groupStore = new HighlightGroupStore();
        this.disposables.push(
            this.groupStore,
            eventBus.on("redraw", this.handleRedraw, this),
            eventBus.on("flush-redraw", this.handleRedrawFlush, this),
            window.onDidChangeTextEditorVisibleRanges((e) => this.handleChangeVisibleRanges(e.textEditor)),
        );
    }

    private getGrid(gridId: number): HighlightGrid {
        if (!this.highlightGrids.has(gridId)) {
            this.highlightGrids.set(gridId, new HighlightGrid(this.groupStore));
        }
        return this.highlightGrids.get(gridId)!;
    }

    private async handleRedraw({ name, args }: EventBusData<"redraw">): Promise<void> {
        // Mark our `redraw` event as processing, so that `redraw-flush` will wait for all async
        // execution to complete.
        //
        // We must do this before the await, so that we ensure that this is queued before
        // this function returns (and a flush event could begin)
        this.redrawWaitGroup.add();

        await this.main.viewportManager.isSyncDone;

        try {
            switch (name) {
                case "hl_attr_define": {
                    for (const [id, uiAttrs, , info] of args) {
                        this.handleAttrDefine(
                            id,
                            uiAttrs,
                            info.map((i) => i.hi_name),
                        );
                    }
                    break;
                }
                case "grid_scroll": {
                    for (const [grid, , , , , by] of args) {
                        if (grid !== 1) {
                            this.handleGridScroll(grid, by);
                            this.staleGrids.add(grid);
                        }
                    }
                    break;
                }
                case "grid_line": {
                    for (const [grid, row, col, cells] of args) {
                        if (grid !== 1) {
                            this.handleGridLine(grid, row, col, cells);
                            this.staleGrids.add(grid);
                        }
                    }
                    break;
                }
                case "grid_destroy": {
                    args.forEach(([grid]) => this.handleGridDestroy(grid));
                }
            }
        } finally {
            // We don't want to hold a flush up forever if there's
            // an exception, so we wrap this in a try/finally
            this.redrawWaitGroup.done();
        }
    }

    private async handleRedrawFlush() {
        // Wait for any redraw events that have been received to finish
        // their work, so that we can flush them only after their changes are staged.
        await this.redrawWaitGroup.wait();

        for (const grid of this.staleGrids) {
            const editor = this.main.bufferManager.getEditorFromGridId(grid);
            if (editor) this.getGrid(grid).refreshDecorations(editor);
        }
        this.staleGrids.clear();
    }

    private handleAttrDefine(id: number, attrs: VimHighlightUIAttributes, groups: string[]) {
        this.groupStore.addHighlightGroup(id, attrs, groups);
    }

    private handleGridLine(gridId: number, row: number, col: number, cells: VimCell[]): void {
        const gridOffset = this.main.viewportManager.getGridOffset(gridId);
        const drawLine = gridOffset.line + row;
        // offset for the gutter
        const startCol = col + gridOffset.character;
        const [vimCol, gutterWidth] = startCol < 20 ? [0, 1] : [startCol - 20, 0];
        cells.splice(0, gutterWidth);

        this.getGrid(gridId).handleGridLine(drawLine, vimCol, cells);
    }

    private handleGridScroll(grid: number, by: number): void {
        this.getGrid(grid).scroll(by);
    }

    private handleChangeVisibleRanges(editor: TextEditor): void {
        const gridId = this.main.bufferManager.getGridIdFromEditor(editor);
        if (!gridId) return;

        if (!this.debouncedRefreshOptions.has(gridId)) {
            const debounced = debounce(
                (editor: TextEditor) => {
                    const gridId = this.main.bufferManager.getGridIdFromEditor(editor);
                    if (gridId) this.getGrid(gridId).refreshDecorations(editor);
                },
                VisibleRangesChangeDebounce,
                { leading: false, trailing: true },
            );
            this.debouncedRefreshOptions.set(gridId, debounced);
        }

        this.debouncedRefreshOptions.get(gridId)!(editor);
    }

    private handleGridDestroy(gridId: number): void {
        this.debouncedRefreshOptions.delete(gridId);
        this.highlightGrids.delete(gridId);
    }

    dispose(): void {
        disposeAll(this.disposables);
    }
}
