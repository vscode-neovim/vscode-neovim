import { Disposable } from "vscode";

import { EventBusData, eventBus } from "./eventBus";
import { HighlightProvider } from "./highlight_provider";
import { MainController } from "./main_controller";

export class HighlightManager implements Disposable {
    private disposables: Disposable[] = [];

    private highlightProvider: HighlightProvider;

    private commandsDisposables: Disposable[] = [];

    public constructor(private main: MainController) {
        this.highlightProvider = new HighlightProvider();
        eventBus.on("redraw", this.handleRedraw, this, this.disposables);
    }

    private handleRedraw(data: EventBusData<"redraw">): void {
        const gridHLUpdates: Set<number> = new Set();

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
                            // by > 0 - scroll down, must remove existing elements from first and shift row hl left
                            // by < 0 - scroll up, must remove existing elements from right shift row hl right
                            this.highlightProvider.shiftGridHighlights(grid, by, top);
                            gridHLUpdates.add(grid);
                        }
                    }
                    break;
                }
                case "grid_line": {
                    // eslint-disable-next-line prefer-const
                    for (let [grid, row, col, cells] of args) {
                        const gridOffset = this.main.viewportManager.getGridOffset(grid);
                        if (!gridOffset) {
                            continue;
                        }

                        const editor = this.main.bufferManager.getEditorFromGridId(grid);
                        if (!editor) {
                            continue;
                        }

                        // const topScreenLine = gridConf.cursorLine === 0 ? 0 : gridConf.cursorLine - gridConf.screenLine;
                        const topScreenLine = gridOffset.line;
                        const highlightLine = topScreenLine + row;
                        if (highlightLine >= editor.document.lineCount || highlightLine < 0) {
                            if (highlightLine > 0) {
                                this.highlightProvider.cleanRow(grid, row);
                                gridHLUpdates.add(grid);
                            }
                            continue;
                        }
                        const lineText = editor.document.lineAt(highlightLine).text;
                        let vimCol = col + gridOffset.character;

                        // remove cells from statuscolumn
                        if (vimCol < 20) {
                            vimCol = 0;
                            cells.splice(0, 1);
                        } else {
                            vimCol -= 20;
                        }

                        if (cells.length) {
                            const tabSize = editor.options.tabSize as number;
                            const update = this.highlightProvider.processHLCellsEvent(
                                grid,
                                row,
                                vimCol,
                                cells,
                                lineText,
                                tabSize,
                            );
                            if (update) {
                                gridHLUpdates.add(grid);
                            }
                        }
                    }
                    break;
                }
            }
        }

        if (gridHLUpdates.size) {
            this.applyHLGridUpdates(gridHLUpdates);
        }
    }

    private applyHLGridUpdates = (updates: Set<number>): void => {
        for (const grid of updates) {
            const gridOffset = this.main.viewportManager.getGridOffset(grid);
            const editor = this.main.bufferManager.getEditorFromGridId(grid);
            if (!editor || !gridOffset) {
                continue;
            }
            // !For text changes neovim sends first buf_lines_event followed by redraw event
            // !But since changes are asynchronous and will happen after redraw event we need to wait for them first
            this.main.changeManager.getDocumentChangeCompletionLock(editor.document).then(() => {
                const hls = this.highlightProvider.getGridHighlights(editor, grid, gridOffset.line);
                for (const [decorator, ranges] of hls) {
                    editor.setDecorations(decorator, ranges);
                }
            });
        }
    };

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
        this.commandsDisposables.forEach((d) => d.dispose());
    }
}
