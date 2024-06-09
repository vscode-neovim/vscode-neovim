import { cloneDeep } from "lodash";
import { Range, ThemeColor, type DecorationOptions, type Disposable, type TextEditorDecorationType } from "vscode";

import { BufferManager } from "../buffer_manager";
import { ViewportManager } from "../viewport_manager";

import { GridLine } from "./grid_line";
import { HighlightGroupStore } from "./highlight_group_store";
import { Highlight, HighlightRange, VimCell } from "./types";

export class HighlightGrid implements Disposable {
    // Manages grid lines and is responsible for computing highlight ranges
    private gridLine = new GridLine();
    // The way to clear decorations is to set them to an empty array, so it is
    // necessary to record the decorators used in the last refresh.
    // In the next refresh, if a decorator is no longer used, it should be cleared.
    private prevDecorators: Set<TextEditorDecorationType> = new Set();
    // Flag to indicate if the grid needs to be redrawn
    private isDirty = false;
    // line number -> (hlId -> decoration options)
    // Cache the decorations for each line to avoid recalculating them
    private lineDecorationsCache: Map<number, Map<number, DecorationOptions[]>> = new Map();

    constructor(
        // Used to get the editor and viewport
        private readonly gridId: number,
        // Normalizes highlight IDs and provides decorators
        private readonly groupStore: HighlightGroupStore,
        // Used to get the editor from the grid ID
        private readonly bufferManager: BufferManager,
        // Used to get the viewport from the grid ID
        private readonly viewportManager: ViewportManager,
    ) {}

    private get editor() {
        return this.bufferManager.getEditorFromGridId(this.gridId)!;
    }

    private get viewport() {
        return this.viewportManager.getViewport(this.gridId);
    }

    // #region Handle Redraw Events

    handleGridLine(line: number, vimCol: number, cells: VimCell[]) {
        // normalizes the highlight IDs
        const vimCells = cells.map((cell) => {
            const hlId = cell[1];
            if (hlId) {
                cell[1] = this.groupStore.normalizeHighlightId(hlId);
            }
            return cell;
        });
        this.gridLine.handleGridLine(line, vimCol, vimCells);
        this.lineDecorationsCache.delete(line);
        this.isDirty = true;
    }

    handleRedrawFlush() {
        if (this.isDirty && this.editor && this.viewport) {
            this.refreshDecorations();
            this.isDirty = false;
        }
    }

    // #endregion

    // #region Render Decorations

    private refreshDecorations(): void {
        const { editor, viewport } = this;

        const decorations = new Map<TextEditorDecorationType, DecorationOptions[]>();

        // Get decorations for the viewport
        const startLine = Math.max(0, viewport.topline);
        const endLine = Math.min(editor.document.lineCount - 1, viewport.botline);
        this.getDecorations(startLine, endLine).forEach((opts, decorator) => {
            if (!decorations.has(decorator)) decorations.set(decorator, []);
            decorations.get(decorator)!.push(...opts);
        });

        // Decorators that are no longer used should be cleared
        const currDecorators = new Set(decorations.keys());
        this.prevDecorators.forEach((decorator) => {
            if (!currDecorators.has(decorator)) {
                decorations.set(decorator, []);
            }
        });
        this.prevDecorators = currDecorators;

        // Apply the decorations
        for (const [decorator, ranges] of decorations) {
            editor.setDecorations(decorator, ranges);
        }
    }

    // #endregion

    // #region Compute Decorations

    // decoration type -> decoration options
    private getDecorations(startLine: number, endLine: number): Map<TextEditorDecorationType, DecorationOptions[]> {
        const results = new Map<TextEditorDecorationType, DecorationOptions[]>();

        for (let line = startLine; line <= endLine; line++) {
            // Use the cached decorations if available
            const lineDecorations = this.lineDecorationsCache.has(line)
                ? this.lineDecorationsCache.get(line)!
                : this.getDecorationsForLine(line);
            this.lineDecorationsCache.set(line, lineDecorations);
            lineDecorations.forEach((options, hlId) => {
                const { decorator } = this.groupStore.getDecorator(hlId);
                if (!decorator) return;
                if (!results.has(decorator)) results.set(decorator, []);
                results.get(decorator)!.push(...options);
            });
        }

        return results;
    }

    // hlId -> decoration options
    private getDecorationsForLine(line: number): Map<number, DecorationOptions[]> {
        const editor = this.editor;
        const lineText = editor.document.lineAt(line).text;
        const tabSize = editor.options.tabSize as number;
        const highlights = this.gridLine.computeLineHighlights(line, lineText, tabSize);
        const highlightRanges = this.gridLine.lineHighlightsToRanges(line, highlights);
        return this.highlightRangesToOptions(highlightRanges);
    }

    // hlId -> decoration options
    private highlightRangesToOptions(ranges: HighlightRange[]): Map<number, DecorationOptions[]> {
        const hlId_options = new Map<number, DecorationOptions[]>();
        const pushOptions = (hlId: number, ...options: DecorationOptions[]) => {
            if (!hlId_options.has(hlId)) {
                hlId_options.set(hlId, []);
            }
            hlId_options.get(hlId)!.push(...options);
        };

        ranges.forEach((range) => {
            if (
                (range.textType === "normal" && range.hlId === 0) ||
                (range.textType === "virtual" && range.highlights.every((hl) => hl.hlId === 0))
            )
                return;

            if (range.textType === "virtual") {
                const virtOptions = this.createColVirtTextOptions(range.line, range.col, range.highlights);
                virtOptions.forEach((options, hlId) => pushOptions(hlId, ...options));
            } else {
                pushOptions(range.hlId, {
                    range: new Range(range.line, range.startCol, range.line, range.endCol),
                });
            }
        });

        return hlId_options;
    }

    private createColVirtTextOptions(
        line: number,
        col: number,
        colHighlights: Highlight[],
    ): Map<number, DecorationOptions[]> {
        const lineText = this.editor.document.lineAt(line).text;
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
            const { decorator, options } = this.groupStore.getDecorator(hlId);
            if (!decorator) return;
            if (!hlId_options.has(hlId)) hlId_options.set(hlId, []);
            const width = virtText.length;
            if (col > lineText.length) {
                offset += col - lineText.length; // for 'eol' virtual text
            }
            hlId_options.get(hlId)!.push({
                range,
                renderOptions: {
                    before: {
                        backgroundColor,
                        ...options,
                        contentText: virtText,
                        margin: `0 0 0 ${offset}ch`,
                        width: `${width}ch; position:absolute; z-index:${99 - offset}; white-space: pre; --hlId: ${hlId};`,
                    },
                },
            });
        });
        return hlId_options;
    }

    // #endregion

    dispose(): void {
        const editor = this.editor;
        if (!editor) return;
        this.prevDecorators.forEach((decorator) => editor.setDecorations(decorator, []));
        this.prevDecorators.clear();
    }
}
