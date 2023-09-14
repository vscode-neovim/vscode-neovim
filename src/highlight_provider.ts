import wcswidth from "ts-wcwidth";
import {
    DecorationOptions,
    Range,
    TextEditor,
    TextEditorDecorationType,
    ThemableDecorationRenderOptions,
    ThemeColor,
    window,
} from "vscode";

import { calculateEditorColFromVimScreenCol } from "./utils";

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
}

export interface HighlightConfiguration {
    /**
     * Map specific highlight to use either vim configuration or use vscode decorator configuration
     */
    highlights: {
        [key: string]: "vim" | ThemableDecorationRenderOptions;
    };
}

export interface Highlight {
    hlId: number;
    virtText?: string;
}

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
    const newConfig: ThemableDecorationRenderOptions = {
        ...config,
        after: config.after ? { ...config.after } : undefined,
        before: config.before ? { ...config.before } : undefined,
    };
    newConfig.backgroundColor = normalizeThemeColor(newConfig.backgroundColor);
    newConfig.borderColor = normalizeThemeColor(newConfig.borderColor);
    newConfig.color = normalizeThemeColor(newConfig.color);
    newConfig.outlineColor = normalizeThemeColor(newConfig.outlineColor);
    newConfig.overviewRulerColor = normalizeThemeColor(newConfig.overviewRulerColor);
    if (newConfig.after) {
        newConfig.after.backgroundColor = normalizeThemeColor(newConfig.after.backgroundColor);
        newConfig.after.borderColor = normalizeThemeColor(newConfig.after.borderColor);
        newConfig.after.color = normalizeThemeColor(newConfig.after.color);
    }
    if (newConfig.before) {
        newConfig.before.backgroundColor = normalizeThemeColor(newConfig.before.backgroundColor);
        newConfig.before.borderColor = normalizeThemeColor(newConfig.before.borderColor);
        newConfig.before.color = normalizeThemeColor(newConfig.before.color);
    }
    return newConfig;
}

const isDouble = (c: string) => wcswidth(c) === 2;

export class HighlightProvider {
    /**
     * Current HL. key is the grid id and values is two dimension array representing rows and cols. Array may contain empty values
     */
    private highlights: Map<number, Highlight[][][]> = new Map();
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

    public constructor(conf: HighlightConfiguration) {
        this.configuration = conf;
        for (const [key, config] of Object.entries(this.configuration.highlights)) {
            if (config !== "vim") {
                this.configuration.highlights[key] = normalizeDecorationConfig(config);
            }
        }
    }

    private createDecoratorForHighlightId(id: number, options: ThemableDecorationRenderOptions): void {
        const decorator = window.createTextEditorDecorationType(options);
        this.decoratorConfigurations.set(decorator, options);
        this.highlighIdToDecorator.set(id, decorator);
    }

    public addHighlightGroup(id: number, attrs: VimHighlightUIAttributes, groups: string[]): void {
        // if the highlight consists of any custom groups, use that instead
        const customName = groups.reverse().find((g) => this.configuration.highlights[g] !== undefined);
        const customHl = customName && this.configuration.highlights[customName];
        if (customHl && customHl !== "vim") {
            // no need to create custom decorator if already exists
            if (!this.highlighIdToDecorator.has(id)) {
                this.createDecoratorForHighlightId(id, customHl);
            }
        } else {
            // remove if exists
            if (this.highlighIdToDecorator.has(id)) this.highlighIdToDecorator.get(id)?.dispose();
            // don't create decoration for empty attrs
            if (Object.keys(attrs).length) {
                const conf = vimHighlightToVSCodeOptions(attrs);
                this.createDecoratorForHighlightId(id, conf);
            }
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
        delete gridHl[row];
    }

    public processHLCellsEvent(
        grid: number,
        row: number,
        vimCol: number,
        cells: [string, number?, number?][],
        lineText: string,
        tabSize: number,
    ): boolean {
        let hasUpdates = false;

        const editorCol = calculateEditorColFromVimScreenCol(lineText, vimCol, tabSize);

        // {text, hlId?, repeat?} => {text, hlId}
        const newCells: { text: string; hlId: number }[] = [];
        {
            const maxCells = wcswidth(lineText.replace(/^\t+/, " ".repeat(tabSize)));
            let curHlId = 0;
            for (const [text, _hlId, _repeat] of cells) {
                if (newCells.length > maxCells && text == " ") break;
                if (_hlId != null) curHlId = _hlId;
                for (let i = 0; i < (_repeat ?? 1); i++) {
                    if (newCells.length > maxCells && text == " ") break;
                    newCells.push({ text, hlId: curHlId });
                }
            }
        }

        if (!this.highlights.has(grid)) {
            this.highlights.set(grid, []);
        }
        const gridHl = this.highlights.get(grid)!;
        if (!gridHl[row]) {
            gridHl[row] = [];
        }

        const lineChars = [...lineText];
        let curCol = editorCol;
        const cellIter = newCells.values();

        // #region
        // If the previous column can contain multiple cells,
        // then the redraw cells may contain cells from the previous column.
        if (editorCol > 0) {
            const expectedCells = lineChars[editorCol - 1] === "\t" ? tabSize : wcswidth(lineChars[editorCol - 1]);
            if (expectedCells > 1) {
                const expectedVimCol = wcswidth(lineChars.slice(0, editorCol).join(""));
                if (expectedVimCol > vimCol) {
                    const rightHls: Highlight[] = [];
                    for (let i = 0; i < expectedVimCol - vimCol; i++) {
                        const cell = cellIter.next();
                        if (cell.done) break; // wont't happen
                        rightHls.push({ hlId: cell.value.hlId, virtText: cell.value.text });
                    }
                    const leftHls: Highlight[] = [];
                    if (expectedCells - rightHls.length) {
                        leftHls.push(...(gridHl[row][editorCol - 1] ?? []).slice(0, expectedCells - rightHls.length));
                    }
                    gridHl[row][editorCol - 1] = [...leftHls, ...rightHls];
                }
            }
        }
        // #endregion

        let cellItem = cellIter.next();
        while (!cellItem.done) {
            const hls: Highlight[] = [];
            let cell = cellItem.value;
            const curChar = lineChars[curCol];
            if (curChar === "\t") {
                hls.push({ hlId: cell.hlId, virtText: cell.text });
                for (let i = 0; i < tabSize - 1; i++) {
                    cell = cellIter.next().value;
                    if (cell.text !== "") {
                        hls.push({ hlId: cell.hlId, virtText: cell.text });
                    }
                }
            } else {
                if (isDouble(curChar)) {
                    const nextCell = cellIter.next().value;
                    if (curChar === cell.text) {
                        hls.push({ hlId: cell.hlId });
                    } else {
                        hls.push({ hlId: cell.hlId, virtText: cell.text });
                        if (!isDouble(cell.text)) {
                            hls.push({ hlId: nextCell.hlId, virtText: nextCell.text });
                        }
                    }
                } else {
                    if (curChar === cell.text) {
                        hls.push({ hlId: cell.hlId });
                    } else {
                        hls.push({ hlId: cell.hlId, virtText: cell.text });
                        if (isDouble(cell.text)) {
                            // Next cell text is empty, should ignore it
                            curCol++;
                            cellIter.next();
                        }
                    }
                }
            }

            if (!hls.length || !hls.some((d) => d.hlId !== 0)) {
                if (gridHl[row][curCol]) {
                    hasUpdates = true;
                    delete gridHl[row][curCol];
                }
            } else {
                hasUpdates = true;
                gridHl[row][curCol] = hls;
            }
            /////////////////////////////////////////////
            curCol++;
            cellItem = cellIter.next();
        }

        return hasUpdates;
    }

    public shiftGridHighlights(grid: number, by: number, from: number): void {
        const gridHl = this.highlights.get(grid);
        if (!gridHl) {
            return;
        }
        if (by > 0) {
            // remove clipped out rows
            for (let i = 0; i < by; i++) {
                delete gridHl[from + i];
            }
            // first get non empty indexes, then process, seems faster than iterating whole array
            const idxs: number[] = [];
            gridHl.forEach((_row, idx) => {
                idxs.push(idx);
            });
            // shift
            for (const idx of idxs) {
                if (idx <= from) {
                    continue;
                }
                gridHl[idx - by] = gridHl[idx];
                delete gridHl[idx];
            }
        } else if (by < 0) {
            // remove clipped out rows
            for (let i = 0; i < Math.abs(by); i++) {
                delete gridHl[from !== 0 ? from + i : gridHl.length - 1 - i];
            }
            const idxs: number[] = [];
            gridHl.forEach((_row, idx) => {
                idxs.push(idx);
            });
            for (const idx of idxs.reverse()) {
                if (idx <= from) {
                    continue;
                }
                gridHl[idx + Math.abs(by)] = gridHl[idx];
                delete gridHl[idx];
            }
        }
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
        if (gridHl) {
            gridHl.forEach((rowHighlights, row) => {
                const line = row + topLine;
                const lineText = editor.document.lineAt(Math.min(editor.document.lineCount - 1, line)).text;
                let curHlId = 0;
                let curStartCol = 0;
                let curEndCol = 0;
                rowHighlights.forEach((colHighlights, col) => {
                    if (colHighlights.length > 1 || colHighlights[0].virtText) {
                        this.createColVirtTextOptions(line, col, colHighlights, lineText).forEach((options, hlId) =>
                            pushOptions(hlId, ...options),
                        );
                    } else {
                        // Extend range highlights
                        const { hlId } = colHighlights[0];
                        if (curHlId === hlId && curEndCol === col - 1) {
                            curEndCol = col;
                        } else {
                            if (curHlId)
                                pushOptions(curHlId, { range: new Range(line, curStartCol, line, curEndCol + 1) });
                            curHlId = hlId;
                            curStartCol = col;
                            curEndCol = col;
                        }
                    }
                });
                if (curHlId) {
                    pushOptions(curHlId, { range: new Range(line, curStartCol, line, curEndCol + 1) });
                }
            });
        }

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

        // #region
        // When on a 2-width character,
        // there may be a cell with a highlight ID of 0 and its content is a space used to hide the cell.
        // However, in vscode, we will ignore the highlighting ID of 0.
        // So, we add the character to the preceding virtual text.
        const processedColHighlights: { hlId: number; virtText: string }[] = [];
        colHighlights.forEach(({ virtText, hlId }, idx) => {
            if (hlId === 0 && idx > 0) {
                processedColHighlights[idx - 1].virtText! += virtText;
            } else {
                processedColHighlights.push({ hlId, virtText: virtText! });
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
            const text = virtText.replace(" ", "\u200D");
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
                        width: `${width}ch; position:absolute; z-index:99;`,
                    },
                },
            });
        });
        return hlId_options;
    }
}
