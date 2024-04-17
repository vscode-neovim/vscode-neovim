import { Disposable } from "vscode";

import { EventBusData, eventBus } from "./eventBus";
import { HighlightProvider } from "./highlight_provider";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";
import { PendingUpdates } from "./pending_updates";

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
                            // by > 0 - scroll down, must remove existing elements from first and shift row hl left
                            // by < 0 - scroll up, must remove existing elements from right shift row hl right
                            this.highlightProvider.shiftGridHighlights(grid, by, top);
                            pendingUpdates.addForceUpdate(grid);
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
                                pendingUpdates.addForceUpdate(grid);
                            }
                            continue;
                        }

                        let vimCol = col + gridOffset.character;

                        // remove cells from statuscolumn
                        if (vimCol < 20) {
                            vimCol = 0;
                            cells.splice(0, 1);
                        } else {
                            vimCol -= 20;
                        }

                        const tabSize = editor.options.tabSize as number;

                        if (cells.length) {
                            pendingUpdates.addConditionalUpdate(
                                grid,
                                // Defer the update so that it can be done with the document lock
                                () => {
                                    // FIXME: Possibly due to viewport desync
                                    // This precheck ensures that we don't call lineAt with an out of bounds
                                    // line, which throws and breaks a highlight
                                    if (highlightLine >= editor.document.lineCount) {
                                        // Force an update, just to ensure the highlights are correct
                                        return true;
                                    }

                                    const lineText = editor.document.lineAt(highlightLine).text;
                                    const doUpdate = this.highlightProvider.processHLCellsEvent(
                                        grid,
                                        row,
                                        vimCol,
                                        cells,
                                        lineText,
                                        tabSize,
                                    );

                                    return doUpdate;
                                },
                            );
                        }
                    }
                    break;
                }
            }
        }

        if (pendingUpdates.size() > 0) {
            this.applyHLGridUpdates(pendingUpdates);
        }
    }

    private applyHLGridUpdates = (pendingUpdates: PendingUpdates<number>): void => {
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
    };

    public dispose(): void {
        disposeAll(this.disposables);
    }
}
