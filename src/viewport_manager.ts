import { DebouncedFunc, debounce } from "lodash-es";
import {
    Disposable,
    EventEmitter,
    Position,
    TextEditor,
    TextEditorVisibleRangesChangeEvent,
    window,
    workspace,
} from "vscode";

import actions from "./actions";
import { config } from "./config";
import { EventBusData, eventBus } from "./eventBus";
import { createLogger } from "./logger";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";

const logger = createLogger("ViewportManager");

// all 0-indexed
export class Viewport {
    line = 0; // current line
    col = 0; // current col
    topline = 0; // top viewport line
    botline = 0; // bottom viewport line
    leftcol = 0; // left viewport col
    skipcol = 0; // skip col (maybe left col)
}

export class ViewportManager implements Disposable {
    private disposables: Disposable[] = [];

    /**
     * Current grid viewport, indexed by grid
     */
    private gridViewport: Map<number, Viewport> = new Map();

    // TODO: Temporary solution. Need to refactor cursor manager and viewport manager.
    // Related issue: https://github.com/neovim/neovim/issues/28800
    private cursorChanged = new EventEmitter<number>();
    public onCursorChanged = this.cursorChanged.event;

    public constructor(private main: MainController) {
        this.disposables.push(
            this.cursorChanged,
            window.onDidChangeTextEditorVisibleRanges(this.onDidChangeVisibleRange),
            eventBus.on("redraw", this.handleRedraw, this),
            eventBus.on("window-scroll", ([winId, saveView]) => {
                const gridId = this.main.bufferManager.getGridIdForWinId(winId);
                if (!gridId) {
                    logger.warn(`Unable to update scrolled view. No grid for winId: ${winId}`);
                    return;
                }
                const view = this.getViewport(gridId);
                view.leftcol = saveView.leftcol;
                view.skipcol = saveView.skipcol;
            }),
        );
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

    private handleRedraw({ name, args }: EventBusData<"redraw">) {
        switch (name) {
            case "win_viewport": {
                for (const [grid, , topline, botline, curline, curcol] of args) {
                    const view = this.getViewport(grid);
                    const { line, col } = view;
                    view.topline = topline;
                    view.botline = botline;
                    view.line = curline;
                    view.col = curcol;
                    if (line !== curline || col !== curcol) {
                        this.cursorChanged.fire(grid);
                    }
                }
                break;
            }
            case "grid_destroy": {
                for (const [grid] of args) {
                    this.gridViewport.delete(grid);
                }
                break;
            }
        }
    }

    // #region
    // FIXME: This is a temporary solution to reduce cursor jitter when scrolling.
    private debouncedScrollNeovim!: DebouncedFunc<ViewportManager["scrollNeovim"]>;
    private debounceTime = 20;
    private refreshDebounceTime(): boolean {
        const smoothScrolling = workspace.getConfiguration("editor").get("smoothScrolling", false);
        const debounceTime = smoothScrolling ? 100 : 20; // vscode's scrolling duration is 125ms.
        const updated = this.debounceTime !== debounceTime;
        this.debounceTime = debounceTime;
        return updated;
    }
    private refreshDebounceScroll() {
        this.debouncedScrollNeovim = debounce(this.scrollNeovim.bind(this), this.debounceTime, {
            leading: false,
            trailing: true,
        });
    }
    private onDidChangeVisibleRange = (e: TextEditorVisibleRangesChangeEvent) => {
        if (!this.debouncedScrollNeovim) {
            this.refreshDebounceTime();
            this.refreshDebounceScroll();
            workspace.onDidChangeConfiguration(
                (e) => e.affectsConfiguration("editor") && this.refreshDebounceTime() && this.refreshDebounceScroll(),
                null,
                this.disposables,
            );
        }
        this.debouncedScrollNeovim(e.textEditor);
    };
    // #endregion

    public scrollNeovim(editor: TextEditor | null): void {
        if (editor == null || this.main.modeManager.isInsertMode) {
            return;
        }
        const ranges = editor.visibleRanges;
        if (!ranges || ranges.length == 0 || ranges[0].end.line - ranges[0].start.line <= 1) {
            return;
        }
        const startLine = ranges[0].start.line - config.neovimViewportHeightExtend;
        // when it have fold we need get the last range. it need add 1 line on multiple fold
        const endLine = ranges[ranges.length - 1].end.line + ranges.length + config.neovimViewportHeightExtend;
        const currentLine = editor.selection.active.line;

        const gridId = this.main.bufferManager.getGridIdFromEditor(editor);
        if (gridId == null) {
            return;
        }
        const viewport = this.gridViewport.get(gridId);
        if (viewport && startLine != viewport?.topline && currentLine == viewport?.line) {
            actions.lua("scroll_viewport", Math.max(startLine, 0), endLine);
        }
    }

    dispose() {
        disposeAll(this.disposables);
    }
}
