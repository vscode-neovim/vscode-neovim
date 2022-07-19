import { DecorationOptions, Disposable, window } from "vscode";

import { BufferManager } from "./buffer_manager";
import { HighlightConfiguration, HighlightProvider } from "./highlight_provider";
import { Logger } from "./logger";
import { NeovimExtensionRequestProcessable, NeovimRedrawProcessable } from "./neovim_events_processable";
import { calculateEditorColFromVimScreenCol, convertByteNumToCharNum, GridLineEvent } from "./utils";
import { ViewportManager } from "./viewport_manager";

export interface HighlightManagerSettings {
    highlight: HighlightConfiguration;
    viewportHeight: number;
}

// const LOG_PREFIX = "HighlightManager";

export class HighlightManager implements Disposable, NeovimRedrawProcessable, NeovimExtensionRequestProcessable {
    private disposables: Disposable[] = [];

    private highlightProvider: HighlightProvider;

    private commandsDisposables: Disposable[] = [];

    public constructor(
        private logger: Logger,
        private bufferManager: BufferManager,
        private viewportManager: ViewportManager,
        private settings: HighlightManagerSettings,
    ) {
        this.highlightProvider = new HighlightProvider(settings.highlight);

        // this.commandsDisposables.push(
        //     commands.registerCommand("editor.action.indentationToTabs", () =>
        //         this.resetHighlight("editor.action.indentationToTabs"),
        //     ),
        // );
        // this.commandsDisposables.push(
        //     commands.registerCommand("editor.action.indentationToSpaces", () =>
        //         this.resetHighlight("editor.action.indentationToSpaces"),
        //     ),
        // );
        // this.commandsDisposables.push(
        //     commands.registerCommand("editor.action.reindentlines", () =>
        //         this.resetHighlight("editor.action.reindentlines"),
        //     ),
        // );
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
                        [{ kind: "ui"; ui_name: string; hi_name: string }],
                    ][]) {
                        // a cell can have multiple highlight groups when it overlap by another highlight
                        if (info && info.length) {
                            const groupName = info.reduce((acc, cur) => cur.hi_name + acc, "");
                            this.highlightProvider.addHighlightGroup(id, groupName, uiAttrs);
                        }
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
                        if (row > this.lastViewportRow) {
                            continue;
                        }
                        const gridOffset = this.viewportManager.getGridOffset(grid);
                        if (!gridOffset) {
                            continue;
                        }

                        const editor = this.bufferManager.getEditorFromGridId(grid);
                        if (!editor) {
                            continue;
                        }

                        // const topScreenLine = gridConf.cursorLine === 0 ? 0 : gridConf.cursorLine - gridConf.screenLine;
                        const topScreenLine = gridOffset.topLine;
                        const highlightLine = topScreenLine + row;
                        if (highlightLine >= editor.document.lineCount || highlightLine < 0) {
                            if (highlightLine > 0) {
                                this.highlightProvider.cleanRow(grid, row);
                                gridHLUpdates.add(grid);
                            }
                            continue;
                        }
                        const line = editor.document.lineAt(highlightLine).text;
                        const colStart = col + gridOffset.leftCol;
                        const tabSize = editor.options.tabSize as number;
                        const finalStartCol = calculateEditorColFromVimScreenCol(line, colStart, tabSize);
                        const isExternal = this.bufferManager.isExternalTextDocument(editor.document);
                        const update = this.highlightProvider.processHLCellsEvent(
                            grid,
                            row,
                            finalStartCol,
                            line,
                            isExternal,
                            cells,
                        );
                        if (update) {
                            gridHLUpdates.add(grid);
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

    public async handleExtensionRequest(name: string, args: unknown[]): Promise<void> {
        switch (name) {
            case "text-decorations": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const [hlName, cols] = args as any;
                this.applyTextDecorations(hlName, cols);
                break;
            }
        }
    }

    private get lastViewportRow(): number {
        return this.settings.viewportHeight - 1;
    }

    private applyHLGridUpdates = (updates: Set<number>): void => {
        for (const grid of updates) {
            const gridOffset = this.viewportManager.getGridOffset(grid);
            const editor = this.bufferManager.getEditorFromGridId(grid);
            if (!editor || !gridOffset) {
                continue;
            }
            const hls = this.highlightProvider.getGridHighlights(grid, gridOffset.topLine);
            for (const [decorator, ranges] of hls) {
                editor.setDecorations(decorator, ranges);
            }
        }
    };

    /**
     * Apply text decorations from external command. Currently used by easymotion fork
     * @param hlGroupName VIM HL Group name
     * @param decorations Text decorations, the format is [[lineNum, [colNum, text][]]]
     */
    private applyTextDecorations(hlGroupName: string, decorations: [string, [number, string][]][]): void {
        const editor = window.activeTextEditor;
        if (!editor) {
            return;
        }
        const decorator = this.highlightProvider.getDecoratorForHighlightGroup(hlGroupName);
        if (!decorator) {
            return;
        }
        const conf = this.highlightProvider.getDecoratorOptions(decorator);
        const options: DecorationOptions[] = [];
        for (const [lineStr, cols] of decorations) {
            try {
                const lineNum = parseInt(lineStr, 10) - 1;
                const line = editor.document.lineAt(lineNum).text;
                const drawnAt = new Map();
                for (const [colNum, text] of cols) {
                    // vim sends column in bytes, need to convert to characters
                    const col = convertByteNumToCharNum(line, colNum);
                    const mapKey = [lineNum, Math.min(col + text.length - 1, line.length)].toString();
                    if (drawnAt.has(mapKey)) {
                        // VSCode only lets us draw a single text decoration
                        // at any given character. Any text decorations drawn
                        // past the end of the line get moved back to the end of
                        // the line. This becomes a problem if you have a
                        // line with multiple 2 character marks right
                        // next to each other at the end. The solution is to
                        // use a single text decoration but modify it when a
                        // new decoration would be pushed on top of it.
                        const ogText = drawnAt.get(mapKey).renderOptions.after.contentText;
                        drawnAt.get(mapKey).renderOptions.after.contentText = (text[0] + ogText).substr(
                            0,
                            ogText.length,
                        );
                    } else {
                        const opt = this.highlightProvider.createVirtTextDecorationOption(
                            text,
                            conf,
                            lineNum,
                            col,
                            line.length,
                        );
                        drawnAt.set(mapKey, opt);
                        options.push(opt);
                    }
                }
            } catch {
                // ignore
            }
        }
        editor.setDecorations(decorator, options);
    }

    // TODO: Investigate why it doesn't work. You don't often to change indentation so seems minor
    // private resetHighlight = async (cmd: string): Promise<void> => {
    //     this.logger.debug(`${LOG_PREFIX}: Command wrapper: ${cmd}`);
    //     this.commandsDisposables.forEach((d) => d.dispose());
    //     await commands.executeCommand(cmd);
    //     this.commandsDisposables.push(
    //         commands.registerCommand("editor.action.indentationToTabs", () =>
    //             this.resetHighlight("editor.action.indentationToTabs"),
    //         ),
    //     );
    //     this.commandsDisposables.push(
    //         commands.registerCommand("editor.action.indentationToSpaces", () =>
    //             this.resetHighlight("editor.action.indentationToSpaces"),
    //         ),
    //     );
    //     this.commandsDisposables.push(
    //         commands.registerCommand("editor.action.reindentlines", () =>
    //             this.resetHighlight("editor.action.reindentlines"),
    //         ),
    //     );
    //     // Try clear highlights and force redraw
    //     for (const editor of window.visibleTextEditors) {
    //         const grid = this.bufferManager.getGridIdFromEditor(editor);
    //         if (!grid) {
    //             continue;
    //         }
    //         this.logger.debug(`${LOG_PREFIX}: Clearing HL ranges for grid: ${grid}`);
    //         const reset = this.highlightProvider.clearHighlights(grid);
    //         for (const [decorator, range] of reset) {
    //             editor.setDecorations(decorator, range);
    //         }
    //     }
    //     this.logger.debug(`${LOG_PREFIX}: Redrawing`);
    //     this.client.command("redraw!");
    // };
}
