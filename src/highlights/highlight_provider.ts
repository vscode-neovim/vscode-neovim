import { cloneDeep } from "lodash";
import { DecorationOptions, Disposable, Range, TextEditor, TextEditorDecorationType, ThemeColor } from "vscode";

import { disposeAll } from "../utils";

import type { HighlightGroupManager } from "./group_manager";
import { Highlight, HighlightGrid, ValidCell } from "./highlight_grid";

type Cell = [string, number?, number?];

export class HighlightProvider implements Disposable {
    private disposables: Disposable[] = [];

    /**
     * key is the grid id and values is a grid representing those highlights
     */
    private highlights: Map<number, HighlightGrid> = new Map();
    private prevGridHighlightsIds: Map<number, Set<number>> = new Map();

    public constructor(private groupManager: HighlightGroupManager) {}

    public cleanRow(grid: number, row: number): void {
        const gridHl = this.highlights.get(grid);
        if (!gridHl) {
            return;
        }

        gridHl.cleanRow(row);
    }

    public processHLCellsEvent(
        grid: number,
        row: number,
        vimCol: number,
        cells: Cell[],
        lineText: string,
        tabSize: number,
    ): boolean {
        if (!this.highlights.has(grid)) {
            this.highlights.set(grid, new HighlightGrid());
        }
        const gridHl = this.highlights.get(grid)!;

        // TODO: Break this out somehow
        const validCells: ValidCell[] = [];
        {
            const idealMaxCells = Math.max(0, HighlightGrid.getWidth(lineText, tabSize) - vimCol);
            const currMaxCol = gridHl.maxColInRow(row);
            const maxValidCells = Math.max(idealMaxCells, currMaxCol);
            const eolCells: ValidCell[] = [];
            let currHlId = 0;
            for (const [text, hlId, repeat] of cells) {
                if (hlId != null) {
                    currHlId = this.groupManager.normalizeHighlightId(hlId);
                }
                if (text === "") continue;
                for (let i = 0; i < (repeat ?? 1); i++) {
                    // specially, always add a eol cell, so use LE here
                    if (validCells.length <= maxValidCells) {
                        validCells.push({ text, hlId: currHlId });
                    } else {
                        eolCells.push({ text, hlId: currHlId });
                    }
                }
            }
            // Combine EOL cells that have the same hlId
            // However, preserve cells with hlId 0 for clearing highlights
            const finalEolCells: ValidCell[] = [];
            let hlId = 0;
            for (const cell of eolCells) {
                if (cell.hlId === 0) {
                    finalEolCells.push(cell);
                } else if (cell.hlId === hlId && finalEolCells.length) {
                    finalEolCells[finalEolCells.length - 1].text += cell.text;
                } else {
                    finalEolCells.push(cell);
                }
                hlId = cell.hlId;
            }
            validCells.push(...finalEolCells);
        }

        return gridHl.processHighlightCellsEvent({ row, vimCol, validCells, lineText, tabSize });
    }

    public shiftGridHighlights(grid: number, by: number, from: number): void {
        const gridHl = this.highlights.get(grid);
        if (!gridHl) {
            return;
        }

        gridHl.shiftHighlights(by, from);
    }

    public getGridHighlights(
        editor: TextEditor,
        grid: number,
        topLine: number,
    ): [TextEditorDecorationType, DecorationOptions[]][] {
        const hlId_options = new Map<number, DecorationOptions[]>();
        const pushOptions = (hlId: number, ...options: DecorationOptions[]) => {
            if (!hlId_options.has(hlId)) {
                hlId_options.set(hlId, []);
            }
            hlId_options.get(hlId)!.push(...options);
        };

        const gridHl = this.highlights.get(grid);
        const highlightRanges = gridHl?.buildHighlightRanges(topLine) ?? [];
        highlightRanges.forEach((range) => {
            if (range.textType === "virtual") {
                // FIXME: Possibly due to viewport desync
                if (range.line >= editor.document.lineCount) {
                    return;
                }

                const lineText = editor.document.lineAt(range.line).text;
                this.createColVirtTextOptions(range.line, range.col, range.highlights, lineText).forEach(
                    (options, hlId) => {
                        pushOptions(hlId, ...options);
                    },
                );
            } else {
                pushOptions(range.hlId, {
                    range: new Range(range.line, range.startCol, range.line, range.endCol),
                });
            }
        });

        const result: [TextEditorDecorationType, DecorationOptions[]][] = [];
        hlId_options.forEach((options, hlId) => {
            if (options.length) {
                const { decorator } = this.groupManager.getDecorator(hlId);
                if (decorator) {
                    result.push([decorator, options]);
                }
            }
        });

        const prevHighlights = this.prevGridHighlightsIds.get(grid);
        if (prevHighlights) {
            for (const id of prevHighlights) {
                if (!hlId_options.has(id)) {
                    const { decorator } = this.groupManager.getDecorator(id);
                    if (decorator) {
                        result.push([decorator, []]);
                    }
                }
            }
        }
        this.prevGridHighlightsIds.set(grid, new Set(hlId_options.keys()));

        return result;
    }

    createColVirtTextOptions(
        line: number,
        col: number,
        colHighlights: Highlight[],
        lineText: string,
    ): Map<number, DecorationOptions[]> {
        const hlId_options = new Map<number, DecorationOptions[]>();

        colHighlights = cloneDeep(colHighlights);

        // #region
        // When on a multi-width character,
        // there may be a cell with a highlight ID of 0 and its content is a space used to hide the cell.
        // However, in vscode, we will ignore the highlighting ID of 0.
        // So, we add the character to the preceding virtual text.
        const processedColHighlights: { hlId: number; virtText: string }[] = [];
        colHighlights.forEach(({ virtText, hlId, text }) => {
            // In certain edge cases, the right-side highlight may be appended later,
            // resulting in the column being converted to virt text type.
            // So, the left-side highlight may not include virtText.
            virtText ??= text;
            if (hlId === 0 && processedColHighlights.length > 0) {
                processedColHighlights[processedColHighlights.length - 1].virtText += virtText;
            } else {
                processedColHighlights.push({ hlId, virtText });
            }
        });
        // #endregion

        const virtTextCol = Math.min(lineText.length, col);
        const range = new Range(line, virtTextCol, line, virtTextCol);
        const backgroundColor = new ThemeColor("editor.background");

        processedColHighlights.forEach(({ virtText, hlId }, offset) => {
            const { decorator, options } = this.groupManager.getDecorator(hlId);
            if (!decorator) return;
            if (!hlId_options.has(hlId)) hlId_options.set(hlId, []);
            const text = virtText.replace(/ /g, "\u200D");
            const width = text.length;
            if (col > lineText.length) {
                offset += col - lineText.length; // for 'eol' virtual text
            }
            hlId_options.get(hlId)!.push({
                range,
                renderOptions: {
                    before: {
                        backgroundColor,
                        ...options,
                        contentText: text,
                        margin: `0 0 0 ${offset}ch`,
                        width: `${width}ch; position:absolute; z-index:${99 - offset}; --hlId: ${hlId};`,
                    },
                },
            });
        });
        return hlId_options;
    }

    dispose() {
        disposeAll(this.disposables);
    }
}
