import { Disposable, TextEditorLineNumbersStyle } from "vscode";

import { HighlightConfiguration, HighlightProvider } from "./highlight_provider";
import { MainController } from "./main_controller";
import { NeovimRedrawProcessable } from "./neovim_events_processable";
import { GridLineEvent } from "./utils";

// const LOG_PREFIX = "HighlightManager";

export class HighlightManager implements Disposable, NeovimRedrawProcessable {
    private disposables: Disposable[] = [];

    private highlightProvider: HighlightProvider;

    private commandsDisposables: Disposable[] = [];

    public constructor(
        private main: MainController,
        private settings: HighlightConfiguration,
    ) {
        this.highlightProvider = new HighlightProvider(settings);
    }
    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
        this.commandsDisposables.forEach((d) => d.dispose());
    }

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
        const gridHLUpdates: Set<number> = new Set();

        for (const [name, ...args] of batch) {
            switch (name) {
                case "hl_attr_define": {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    for (const [id, uiAttrs, , info] of args as [
                        number,
                        never,
                        never,
                        [{ kind: "ui" | "syntax" | "terminal"; ui_name: string; hi_name: string }],
                    ][]) {
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
                    for (const [grid, top, , , , by] of args as [
                        number,
                        number,
                        number,
                        null,
                        number,
                        number,
                        number,
                    ][]) {
                        if (grid === 1) {
                            continue;
                        }
                        // by > 0 - scroll down, must remove existing elements from first and shift row hl left
                        // by < 0 - scroll up, must remove existing elements from right shift row hl right
                        this.highlightProvider.shiftGridHighlights(grid, by, top);
                        gridHLUpdates.add(grid);
                    }
                    break;
                }
                case "grid_line": {
                    // [grid, row, colStart, cells: [text, hlId, repeat]]
                    const gridEvents = args as GridLineEvent[];

                    // eslint-disable-next-line prefer-const
                    for (let [grid, row, col, cells] of gridEvents) {
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
}
