import { WaitGroup } from "@jpwilliams/waitgroup";
import { Disposable } from "vscode";

import { EventBusData, VimHighlightUIAttributes, eventBus } from "./eventBus";
import { HighlightGrid } from "./highlights/highlight_grid";
import { HighlightGroupStore } from "./highlights/highlight_group_store";
import { VimCell } from "./highlights/types";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";

export class HighlightManager implements Disposable {
    private disposables: Disposable[] = [];
    private redrawWaitGroup = new WaitGroup();
    // Manages the highlight groups
    private groupStore: HighlightGroupStore;
    // Map of gridId -> HighlightGrid
    private highlightGrids: Map<number, HighlightGrid> = new Map();

    public constructor(private main: MainController) {
        this.groupStore = new HighlightGroupStore();
        this.disposables.push(
            this.groupStore,
            eventBus.on("redraw", this.handleRedraw, this),
            eventBus.on("flush-redraw", this.handleRedrawFlush, this),
        );
    }

    // Get or create a HighlightGrid for the given gridId
    private getGrid(gridId: number): HighlightGrid {
        if (!this.highlightGrids.has(gridId)) {
            this.highlightGrids.set(
                gridId,
                new HighlightGrid(
                    gridId,
                    this.groupStore,
                    this.main.bufferManager,
                    this.main.viewportManager,
                    this.main.changeManager,
                ),
            );
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
                // NOTES: We don't handle "grid_scroll" because:
                // 1. We only need the cells data of the grid and do not need to consider scrolling.
                // 2. The scrolled-in area will be filled using `grid_line` directly after the scroll event.
                // Thus, we don't need to clear this area as part of handling the scroll event. (From the neovim-ui doc)
                case "grid_line": {
                    for (const [grid, row, col, cells] of args) {
                        if (grid !== 1) {
                            this.handleGridLine(grid, row, col, cells);
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
        this.highlightGrids.forEach((grid) => grid.handleRedrawFlush());
    }

    private handleAttrDefine(id: number, attrs: VimHighlightUIAttributes, groups: string[]) {
        this.groupStore.add(id, attrs, groups);
    }

    private handleGridLine(gridId: number, row: number, col: number, cells: VimCell[]): void {
        const gridOffset = this.main.viewportManager.getGridOffset(gridId);
        const drawLine = gridOffset.line + row;
        // Offset for the statuscolumn
        // We have fixed the width of the statuscolumn to 20.
        const startCol = col + gridOffset.character;
        const [vimCol, gutterWidth] = startCol < 20 ? [0, 1] : [startCol - 20, 0];
        cells.splice(0, gutterWidth);

        this.getGrid(gridId).handleGridLine(drawLine, vimCol, cells);
    }

    private handleGridDestroy(gridId: number): void {
        this.highlightGrids.get(gridId)?.dispose();
        this.highlightGrids.delete(gridId);
    }

    dispose(): void {
        disposeAll(this.disposables);
    }
}
