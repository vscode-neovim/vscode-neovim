import {
    DecorationOptions,
    Range,
    TextEditor,
    TextEditorDecorationType,
    ThemableDecorationRenderOptions,
    ThemeColor,
    window,
} from "vscode";

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
    overlayPos?: number;
    line?: string;
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

export class HighlightProvider {
    /**
     * Current HL. key is the grid id and values is two dimension array representing rows and cols. Array may contain empty values
     */
    private highlights: Map<number, Highlight[][]> = new Map();
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
        start: number,
        lineText: string,
        cells: [string, number?, number?][],
    ): boolean {
        let cellHlId = 0;
        let cellIdx = start;
        if (!this.highlights.has(grid)) {
            this.highlights.set(grid, []);
        }
        const gridHl = this.highlights.get(grid)!;
        let hasUpdates = false;

        for (const [ctext, hlId, repeat] of cells) {
            if (hlId != null) {
                cellHlId = hlId;
            }
            let text = ctext;

            // 2+bytes chars (such as chinese characters) have "" as second cell
            if (text === "") {
                continue;
            }
            // tab fill character
            if (text === "♥") {
                continue;
            }

            const listCharsTab = "❥";

            const repeatTo = text === "\t" || text === listCharsTab ? 1 : repeat || 1;
            for (let i = 0; i < repeatTo; i++) {
                if (!gridHl[row]) {
                    gridHl[row] = [];
                }
                if (cellHlId != 0) {
                    hasUpdates = true;
                    const hlDeco: Highlight = {
                        hlId: cellHlId,
                    };
                    // check if text is not same as the cell text on buffer
                    // only render decorations one cell past the end of the line
                    const curChar = lineText.slice(cellIdx, cellIdx + text.length);
                    if (text === listCharsTab) text = "\t";
                    if (cellIdx <= lineText.length && text !== "" && curChar !== text) {
                        // if we are past end, or text is " ", we need to add something to make sure it gets rendered
                        hlDeco.virtText = text.replace(" ", "\u200D");
                        hlDeco.overlayPos = lineText.length > 0 ? cellIdx : 1;
                    }
                    gridHl[row][cellIdx] = hlDeco;
                } else if (gridHl[row][cellIdx]) {
                    hasUpdates = true;
                    delete gridHl[row][cellIdx];
                }
                cellIdx++;
            }
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
        const result: [TextEditorDecorationType, DecorationOptions[]][] = [];
        const hlRanges: Map<
            number,
            Array<{ lineS: number; lineE: number; colS: number; colE: number; hl?: Highlight }>
        > = new Map();
        const gridHl = this.highlights.get(grid);

        if (gridHl) {
            let currHlId = 0;
            let currHlStartRow = 0;
            let currHlEndRow = 0;
            let currHlStartCol = 0;
            let currHlEndCol = 0;
            // forEach faster than for in/of for arrays while iterating on array with empty values
            gridHl.forEach((rowHighlights, rowIdx) => {
                rowHighlights.forEach((hlDeco, cellIdx) => {
                    if (hlDeco.virtText) {
                        if (!hlRanges.has(hlDeco.hlId)) {
                            hlRanges.set(hlDeco.hlId, []);
                        }
                        // it only has one character we don't need group like normal highlight
                        hlRanges.get(hlDeco.hlId)!.push({
                            lineS: rowIdx,
                            lineE: rowIdx,
                            colS: hlDeco.overlayPos || cellIdx,
                            colE: cellIdx + 1,
                            hl: hlDeco,
                        });
                        return;
                    }
                    if (
                        currHlId === hlDeco.hlId &&
                        // allow to extend prev HL if on same row and next cell OR previous row and end of range is end col
                        currHlEndRow === rowIdx &&
                        currHlEndCol === cellIdx - 1
                    ) {
                        currHlEndCol = cellIdx;
                    } else {
                        if (currHlId) {
                            if (!hlRanges.has(currHlId)) {
                                hlRanges.set(currHlId, []);
                            }
                            hlRanges.get(currHlId)!.push({
                                lineS: currHlStartRow,
                                lineE: currHlEndRow,
                                colS: currHlStartCol,
                                colE: currHlEndCol,
                            });
                            currHlId = 0;
                            currHlStartCol = 0;
                            currHlEndCol = 0;
                            currHlStartRow = 0;
                            currHlEndRow = 0;
                        }
                        currHlId = hlDeco.hlId;
                        currHlStartRow = rowIdx;
                        currHlEndRow = rowIdx;
                        currHlStartCol = cellIdx;
                        currHlEndCol = cellIdx;
                    }
                });
            });
            if (currHlId) {
                if (!hlRanges.has(currHlId)) {
                    hlRanges.set(currHlId, []);
                }
                hlRanges.get(currHlId)!.push({
                    lineS: currHlStartRow,
                    lineE: currHlEndRow,
                    colS: currHlStartCol,
                    colE: currHlEndCol,
                });
            }
        }
        for (const [id, ranges] of hlRanges) {
            const decorator = this.getDecoratorForHighlightId(id);
            if (!decorator) {
                continue;
            }
            const decoratorRanges = ranges.map((r) => {
                const lineLength = editor.document.lineAt(Math.min(topLine + r.lineS, editor.document.lineCount - 1))
                    .text.length;
                if (r.hl) {
                    const conf = this.getDecoratorOptions(decorator);
                    return this.createVirtTextDecorationOption(
                        r.hl.virtText!,
                        { ...conf, backgroundColor: conf.backgroundColor || new ThemeColor("editor.background") }, // overwrite text underneath
                        topLine + r.lineS,
                        r.colS + 1,
                        lineLength,
                    );
                }
                return {
                    range: new Range(topLine + r.lineS, r.colS, topLine + r.lineE, r.colE + 1),
                } as DecorationOptions;
            });
            result.push([decorator, decoratorRanges]);
        }

        const prevHighlights = this.prevGridHighlightsIds.get(grid);
        if (prevHighlights) {
            for (const id of prevHighlights) {
                if (!hlRanges.has(id)) {
                    const decorator = this.getDecoratorForHighlightId(id);
                    if (!decorator) {
                        continue;
                    }
                    result.push([decorator, []]);
                }
            }
        }
        this.prevGridHighlightsIds.set(grid, new Set(hlRanges.keys()));
        return result;
    }

    private createDecoratorForHighlightId(id: number, options: ThemableDecorationRenderOptions): void {
        const decorator = window.createTextEditorDecorationType(options);
        this.decoratorConfigurations.set(decorator, options);
        this.highlighIdToDecorator.set(id, decorator);
    }

    public createVirtTextDecorationOption(
        text: string,
        conf: ThemableDecorationRenderOptions,
        lineNum: number,
        col: number,
        lineLength: number,
    ): DecorationOptions {
        const textDeco: DecorationOptions = {
            range: new Range(lineNum, col + text.length - 1, lineNum, col + text.length - 1),
            renderOptions: {
                // Inspired by https://github.com/VSCodeVim/Vim/blob/badecf1b7ecd239e3ed58720245b6f4a74e439b7/src/actions/plugins/easymotion/easymotion.ts#L64
                after: {
                    // What's up with the negative right
                    // margin? That shifts the decoration to the
                    // right. By default VSCode places the
                    // decoration behind the text. If we
                    // shift it one character to the right,
                    // it will be on top.
                    // Why do all that math in the right
                    // margin?  If we try to draw off the
                    // end of the screen, VSCode will place
                    // the text in a column we weren't
                    // expecting. This code accounts for that.
                    margin: `0 0 0 -${Math.min(lineLength - col + 1, text.length)}ch`,
                    ...conf,
                    ...conf.before,
                    width: `${text.length}ch; position:absolute; z-index:99;`,
                    contentText: text,
                },
            },
        };
        return textDeco;
    }
}
