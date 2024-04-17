import { Disposable, TextEditor } from "vscode";

import { EventBusData, eventBus } from "./eventBus";
import { HighlightProvider } from "./highlight_provider";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";
import { PendingUpdates } from "./pending_updates";

type GridCell = [string, number, number];

export class HighlightManager implements Disposable {
    private disposables: Disposable[] = [];

    private highlightProvider: HighlightProvider;

    public constructor(private main: MainController) {
        this.highlightProvider = new HighlightProvider();
        this.disposables.push(this.highlightProvider);
        this.disposables.push(eventBus.on("redraw", this.handleRedraw, this));
    }

    private async handleRedraw(data: EventBusData<"redraw">): Promise<void> {
        await this.main.viewportManager.isSyncDone;

        const pendingUpdates = new PendingUpdates<number>();
        for (const { name, args } of data) {
            switch (name) {
                case "hl_attr_define": {
                    for (const [id, uiAttrs, , info] of args) {
                        this.highlightProvider.addHighlightGroup(
                            id,
                            uiAttrs,
                            info.map((i) => i.hi_name),
                        );
                    }
                    break;
                }
                // nvim may not send grid_cursor_goto and instead uses grid_scroll along with grid_line
                case "grid_scroll": {
                    for (const [grid, top, , , , by] of args) {
                        if (grid !== 1) {
                            this.scrollHighlights(pendingUpdates, grid, top, by);
                        }
                    }
                    break;
                }
                case "grid_line": {
                    for (const [grid, row, col, cells] of args) {
                        this.stageGridLineUpdates(pendingUpdates, grid, row, col, cells);
                    }
                    break;
                }
            }
        }

        if (pendingUpdates.size() > 0) {
            this.applyHLGridUpdates(pendingUpdates);
        }
    }

    private scrollHighlights(pendingUpdates: PendingUpdates<number>, grid: number, top: number, by: number) {
        // by > 0 - scroll down, must remove existing elements from first and shift row hl left
        // by < 0 - scroll up, must remove existing elements from right shift row hl right
        this.highlightProvider.shiftGridHighlights(grid, by, top);
        pendingUpdates.addForceUpdate(grid);
    }

    private stageGridLineUpdates(
        pendingUpdates: PendingUpdates<number>,
        grid: number,
        row: number,
        col: number,
        cells: GridCell[],
    ): void {
        const gridOffset = this.main.viewportManager.getGridOffset(grid);
        if (!gridOffset) {
            return;
        }

        const editor = this.main.bufferManager.getEditorFromGridId(grid);
        if (!editor) {
            return;
        }

        const topScreenLine = gridOffset.line;
        const highlightLine = topScreenLine + row;
        if (this.highlightLineOutOfBounds(editor, highlightLine)) {
            // Clear any highlights that we already know are out of bounds
            this.cleanHighlightLine(grid, row, highlightLine);
            pendingUpdates.addForceUpdate(grid);
            return;
        }

        if (cells.length === 0) {
            // Nothing to highlight
            return;
        }

        const { vimCol, cells: statusLineCells } = this.offsetForStatusLine(col + gridOffset.character);
        cells.splice(0, statusLineCells);

        const tabSize = editor.options.tabSize as number;
        pendingUpdates.addConditionalUpdate(
            grid,
            // Defer the update so that it can be done with the document lock
            () => {
                // Ideally we wouldn't have to check this again, but it's possible we've become desynced
                // since we checked this before, and lineAt will throw if highlightLine is out of bounds.
                // If we end up in this state, we should clear the line again and move on
                if (this.highlightLineOutOfBounds(editor, highlightLine)) {
                    return this.cleanHighlightLine(grid, row, highlightLine);
                }

                const lineText = editor.document.lineAt(highlightLine).text;
                return this.highlightProvider.processHLCellsEvent(grid, row, vimCol, cells, lineText, tabSize);
            },
        );
    }

    private cleanHighlightLine(grid: number, vimRow: number, editorHighlightLine: number): boolean {
        if (editorHighlightLine < 0) {
            return false;
        }

        this.highlightProvider.cleanRow(grid, vimRow);
        return true;
    }

    private offsetForStatusLine(vimCol: number): { vimCol: number; cells: number } {
        if (vimCol < 20) {
            vimCol = 0;
            return { vimCol: 0, cells: 1 };
        } else {
            return { vimCol: vimCol - 20, cells: 0 };
        }
    }

    private applyHLGridUpdates(pendingUpdates: PendingUpdates<number>): void {
        for (const [grid, update] of pendingUpdates.entries()) {
            const gridOffset = this.main.viewportManager.getGridOffset(grid);
            const editor = this.main.bufferManager.getEditorFromGridId(grid);
            if (!editor || !gridOffset) {
                continue;
            }
            // !For text changes neovim sends first buf_lines_event followed by redraw event
            // !But since changes are asynchronous and will happen after redraw event we need to wait for them first
            this.main.changeManager.getDocumentChangeCompletionLock(editor.document).then(() => {
                const changed = update();
                if (!changed) {
                    return;
                }

                const hls = this.highlightProvider.getGridHighlights(editor, grid, gridOffset.line);
                for (const [decorator, ranges] of hls) {
                    editor.setDecorations(decorator, ranges);
                }
            });
        }
    }

    private highlightLineOutOfBounds(editor: TextEditor, editorHighlightLine: number): boolean {
        return editorHighlightLine >= editor.document.lineCount || editorHighlightLine < 0;
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }
}
