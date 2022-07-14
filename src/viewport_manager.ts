import { NeovimClient } from "neovim";
import { commands, Disposable, window } from "vscode";
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

    public constructor(private logger: Logger, private client: NeovimClient, private bufferManager: BufferManager) {}

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
            this.logger.error(`${LOG_PREFIX}: No viewport for gridId: ${gridId}`);
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
            this.logger.error(`${LOG_PREFIX}: No viewport for gridId: ${gridId}`);
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
                    this.logger.warn(`${LOG_PREFIX}: No gird for winId: ${winId}`);
                    break;
                }
                this.gridViewport.set(gridId, view);
            }
        }
    }

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
