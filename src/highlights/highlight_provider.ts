import { cloneDeep } from "lodash-es";
import {
    DecorationOptions,
    DecorationRangeBehavior,
    Disposable,
    Range,
    TextEditor,
    TextEditorDecorationType,
    ThemableDecorationRenderOptions,
    ThemeColor,
    window,
} from "vscode";

import { config } from "../config";

import { Highlight, HighlightGrid, ValidCell } from "./highlight_grid";

export interface VimHighlightUIAttributes {
    foreground?: number;
    background?: number;
    special?: number;
    reverse?: boolean;
    italic?: boolean;
    bold?: boolean;
    strikethrough?: boolean;
    // has special color
    underline?: boolean;
    // has special color
    undercurl?: boolean;
    blend?: number;
    altfont?: boolean;
}

export interface HighlightConfiguration {
    /**
     * Map specific highlight to use vscode decorator configuration
     */
    highlights: {
        [key: string]: ThemableDecorationRenderOptions;
    };
}

type Cell = [string, number?, number?];

/**
 * Convert VIM HL attributes to vscode text decoration attributes
 * @param uiAttrs VIM UI attribute
 * @param vimSpecialColor Vim special color
 */
function vimHighlightToVSCodeOptions(uiAttrs: VimHighlightUIAttributes): ThemableDecorationRenderOptions {
    const options: ThemableDecorationRenderOptions = {};
    // for absent color keys color should not be changed
    if (uiAttrs.background !== undefined) {
        options.backgroundColor = "#" + uiAttrs.background.toString(16).padStart(6, "0");
    }
    if (uiAttrs.foreground !== undefined) {
        options.color = "#" + uiAttrs.foreground.toString(16).padStart(6, "0");
    }

    const specialColor = uiAttrs.special !== undefined ? "#" + uiAttrs.special.toString(16).padStart(6, "0") : "";

    if (uiAttrs.reverse !== undefined) {
        options.backgroundColor = new ThemeColor("editor.foreground");
        options.color = new ThemeColor("editor.background");
    }
    if (uiAttrs.italic !== undefined) {
        options.fontStyle = "italic";
    }
    if (uiAttrs.bold !== undefined) {
        options.fontWeight = "bold";
    }
    if (uiAttrs.strikethrough !== undefined) {
        options.textDecoration = "line-through solid";
    }
    if (uiAttrs.underline !== undefined) {
        options.textDecoration = `underline ${specialColor} solid`;
    }
    if (uiAttrs.undercurl !== undefined) {
        options.textDecoration = `underline ${specialColor} wavy`;
    }
    return options;
}

function normalizeThemeColor(color: string | ThemeColor | undefined): string | ThemeColor | undefined {
    if (typeof color === "string" && color.startsWith("theme.")) {
        color = new ThemeColor(color.slice(6));
    }
    return color;
}

function normalizeDecorationConfig(config: ThemableDecorationRenderOptions): ThemableDecorationRenderOptions {
    const newConfig: ThemableDecorationRenderOptions = { ...config };
    newConfig.backgroundColor = normalizeThemeColor(newConfig.backgroundColor);
    newConfig.borderColor = normalizeThemeColor(newConfig.borderColor);
    newConfig.color = normalizeThemeColor(newConfig.color);
    newConfig.outlineColor = normalizeThemeColor(newConfig.outlineColor);
    newConfig.overviewRulerColor = normalizeThemeColor(newConfig.overviewRulerColor);
    return newConfig;
}

export class HighlightProvider implements Disposable {
    /**
     * key is the grid id and values is a grid representing those highlights
     */
    private highlights: Map<number, HighlightGrid> = new Map();
    private prevGridHighlightsIds: Map<number, Set<number>> = new Map();
    /**
     * HL group id to text decorator
     */
    private highlighIdToDecorator: Map<number, TextEditorDecorationType> = new Map();
    /**
     * Store configuration per decorator
     */
    private decoratorConfigurations: Map<TextEditorDecorationType, ThemableDecorationRenderOptions> = new Map();

    private configuration: HighlightConfiguration;

    // Treat all colors mixed with Visual as Visual to avoid defective rendering due to disjointed decoration ranges.
    private visualHighlightId?: number;
    private visualHighlightIds: number[] = [];

    public constructor() {
        const highlights: HighlightConfiguration["highlights"] = {};
        for (const [key, opts] of Object.entries(config.highlights)) {
            highlights[key] = normalizeDecorationConfig(opts);
        }
        this.configuration = { highlights };
    }

    dispose() {
        for (const decoration of this.highlighIdToDecorator.values()) {
            decoration.dispose();
        }
    }

    private createDecoratorForHighlightId(id: number, options: ThemableDecorationRenderOptions): void {
        if (options.borderColor != null && options.border == null) {
            options.border = "1px solid";
        }
        const decorator = window.createTextEditorDecorationType({
            ...options,
            rangeBehavior: DecorationRangeBehavior.ClosedClosed,
        });
        this.decoratorConfigurations.set(decorator, options);
        this.highlighIdToDecorator.set(id, decorator);
    }

    public addHighlightGroup(id: number, attrs: VimHighlightUIAttributes, groups: string[]): void {
        delete attrs.altfont;
        if (groups.includes("Visual")) {
            if (groups.length === 1) this.visualHighlightId = id;
            else this.visualHighlightIds.push(id);
        }
        // if the highlight consists of any custom groups, use that instead
        const customName = groups.reverse().find((g) => this.configuration.highlights[g] !== undefined);
        const customHl = customName && this.configuration.highlights[customName];
        if (customHl && (groups.length === 1 || Object.keys(attrs).length === 0)) {
            if (!this.highlighIdToDecorator.has(id)) {
                this.createDecoratorForHighlightId(id, customHl);
            }
            return;
        }
        if (this.highlighIdToDecorator.has(id)) this.highlighIdToDecorator.get(id)?.dispose();
        if (Object.keys(attrs).length) {
            const conf = vimHighlightToVSCodeOptions(attrs);
            this.createDecoratorForHighlightId(id, conf);
        }
    }

    public getDecoratorForHighlightId(id: number): TextEditorDecorationType | undefined {
        return this.highlighIdToDecorator.get(id);
    }

    public getDecoratorOptions(decorator: TextEditorDecorationType): ThemableDecorationRenderOptions {
        return this.decoratorConfigurations.get(decorator)!;
    }

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
                    if (this.visualHighlightId && this.visualHighlightIds.includes(hlId)) {
                        currHlId = this.visualHighlightId;
                    } else {
                        currHlId = hlId;
                    }
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
                const decorator = this.getDecoratorForHighlightId(hlId);
                if (decorator) {
                    result.push([decorator, options]);
                }
            }
        });

        const prevHighlights = this.prevGridHighlightsIds.get(grid);
        if (prevHighlights) {
            for (const id of prevHighlights) {
                if (!hlId_options.has(id)) {
                    const decorator = this.getDecoratorForHighlightId(id);
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
            const decorator = this.getDecoratorForHighlightId(hlId);
            if (!decorator) return;
            if (!hlId_options.has(hlId)) hlId_options.set(hlId, []);
            const text = virtText.replace(/ /g, "\u200D");
            const conf = this.getDecoratorOptions(decorator);
            const width = text.length;
            if (col > lineText.length) {
                offset += col - lineText.length; // for 'eol' virtual text
            }
            hlId_options.get(hlId)!.push({
                range,
                renderOptions: {
                    before: {
                        backgroundColor,
                        ...conf,
                        contentText: text,
                        margin: `0 0 0 ${offset}ch`,
                        width: `${width}ch; position:absolute; z-index:${99 - offset}; --hlId: ${hlId};`,
                    },
                },
            });
        });
        return hlId_options;
    }
}
