import {
    DecorationOptions,
    Range,
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
     * Ignore highlights
     */
    ignoreHighlights: string[];
    /**
     * What to do on unknown highlights. Either accept vim or use vscode decorator configuration
     */
    unknownHighlight: "vim" | ThemableDecorationRenderOptions;
    /**
     * Map specific highlight to use either vim configuration or use vscode decorator configuration
     */
    highlights: {
        [key: string]: "vim" | ThemableDecorationRenderOptions;
    };
}

export interface HightlightExtMark {
    hlId: number;
    /**
     * :h nvim_buf_set_extmark()
     * mapping with virt_text_pos on ext_mark in neovim
     * currently support overylay option
     */
    virtTextPos?: "overlay" | "right_align" | "eol";
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
    private highlights: Map<number, HightlightExtMark[][]> = new Map();
    private prevGridHighlightsIds: Map<number, Set<string>> = new Map();
    /**
     * Maps highlight id to highlight group name
     */
    private highlightIdToGroupName: Map<number, string> = new Map();
    /**
     * Maps highlight id can be overlay with extmark
     */
    private highlightIdToOverlay: Map<number, boolean> = new Map();
    /**
     * HL group name to text decorator
     * Not all HL groups are supported now
     */
    private highlighGroupToDecorator: Map<string, TextEditorDecorationType> = new Map();
    /**
     * Store configuration per decorator
     */
    private decoratorConfigurations: Map<TextEditorDecorationType, ThemableDecorationRenderOptions> = new Map();

    private configuration: HighlightConfiguration;

    /**
     * Set of ignored HL group ids. They can still be used with force flag (mainly for statusbar color decorations)
     */
    private ignoredGroupIds: Set<number> = new Set();
    /**
     * List of always ignored groups
     */
    private alwaysIgnoreGroups = [
        "Normal",
        "NormalNC",
        "NormalFloat",
        "NonText",
        "SpecialKey",
        "TermCursor",
        "TermCursorNC",
        // "Visual",
        "Conceal",
        "CursorLine",
        "CursorLineNr",
        "ColorColumn",
        "LineNr",
        "StatusLine",
        "StatusLineNC",
        "VertSplit",
        "Title",
        "WildMenu",
        "Whitespace",
    ];

    public constructor(conf: HighlightConfiguration) {
        this.configuration = conf;
        if (this.configuration.unknownHighlight !== "vim") {
            this.configuration.unknownHighlight = normalizeDecorationConfig(this.configuration.unknownHighlight);
        }
        for (const [key, config] of Object.entries(this.configuration.highlights)) {
            if (config !== "vim") {
                const options = normalizeDecorationConfig(config);
                this.configuration.highlights[key] = options;
                // precreate groups if configuration was defined
                this.createDecoratorForHighlightGroup(key, options);
            }
        }
    }

    public addHighlightGroup(id: number, name: string, vimUiAttrs: VimHighlightUIAttributes): void {
        if (
            this.configuration.ignoreHighlights.includes(name) ||
            this.configuration.ignoreHighlights.find((i) =>
                i.startsWith("^") || i.endsWith("$") ? new RegExp(i).test(name) : false,
            )
        ) {
            this.ignoredGroupIds.add(id);
        }
        if (this.highlighGroupToDecorator.has(name)) this.highlighGroupToDecorator.get(name)?.dispose();
        this.highlightIdToGroupName.set(id, name);
        const options = this.configuration.highlights[name] || this.configuration.unknownHighlight;
        const conf = options === "vim" ? vimHighlightToVSCodeOptions(vimUiAttrs) : options;
        // Search highlight creates https://github.com/vscode-neovim/vscode-neovim/issues/968
        if (!this.ignoredGroupIds.has(id) && !name.endsWith("Search")) {
            this.highlightIdToOverlay.set(id, true);
        }
        this.createDecoratorForHighlightGroup(name, conf);
    }

    public getHighlightGroupName(id: number, force = false): string | undefined {
        if (this.ignoredGroupIds.has(id) && !force) {
            return;
        }
        const name = this.highlightIdToGroupName.get(id);
        if (name && this.alwaysIgnoreGroups.includes(name)) {
            return;
        }
        return name;
    }

    public getDecoratorForHighlightGroup(name: string): TextEditorDecorationType | undefined {
        let dec = this.highlighGroupToDecorator.get(name);
        if (!dec && name.endsWith("Default")) {
            dec = this.highlighGroupToDecorator.get(name.slice(0, -7));
        }
        if (!dec) {
            dec = this.highlighGroupToDecorator.get(name + "Default");
        }
        return dec;
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
        external: boolean,
        cells: [string, number?, number?][],
    ): boolean {
        let cellHlId = 0;
        let cellIdx = start;
        if (!this.highlights.has(grid)) {
            this.highlights.set(grid, []);
        }
        const gridHl = this.highlights.get(grid)!;
        let hasUpdates = false;

        for (const [text, hlId, repeat] of cells) {
            // 2+bytes chars (such as chinese characters) have "" as second cell
            if (text === "") {
                continue;
            }
            // tab fill character
            if (text === "♥") {
                continue;
            }
            if (hlId != null) {
                cellHlId = hlId;
            }
            const groupName = this.getHighlightGroupName(cellHlId, external);
            const canOverLay = this.highlightIdToOverlay.get(cellHlId);

            const listCharsTab = "❥";

            const repeatTo = text === "\t" || text === listCharsTab ? 1 : repeat || 1;
            // const repeatTo =
            //     text === "\t" || line[cellIdx] === "\t" ? Math.ceil((repeat || tabSize) / tabSize) : repeat || 1;
            for (let i = 0; i < repeatTo; i++) {
                if (!gridHl[row]) {
                    gridHl[row] = [];
                }
                if (groupName) {
                    hasUpdates = true;
                    const hlDeco: HightlightExtMark = {
                        hlId: cellHlId,
                    };
                    if (canOverLay) {
                        const curChar = lineText.slice(cellIdx, cellIdx + text.length);
                        // text is not same as the cell text on buffer
                        if (curChar != text && text != " " && text != "" && text != listCharsTab) {
                            hlDeco.virtText = text;
                            hlDeco.virtTextPos = "overlay";
                            hlDeco.overlayPos = lineText.length > 0 ? cellIdx : 1;
                        }
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

    public getGridHighlights(grid: number, topLine: number): [TextEditorDecorationType, DecorationOptions[]][] {
        const result: [TextEditorDecorationType, DecorationOptions[]][] = [];
        const hlRanges: Map<
            string,
            Array<{ lineS: number; lineE: number; colS: number; colE: number; hl?: HightlightExtMark }>
        > = new Map();
        const gridHl = this.highlights.get(grid);

        if (gridHl) {
            // let currHlId = 0;
            let currHlName = "";
            let currHlStartRow = 0;
            let currHlEndRow = 0;
            let currHlStartCol = 0;
            let currHlEndCol = 0;
            // forEach faster than for in/of for arrays while iterating on array with empty values
            gridHl.forEach((rowHighlights, rowIdx) => {
                rowHighlights.forEach((hlDeco, cellIdx) => {
                    const cellHlName = this.highlightIdToGroupName.get(hlDeco.hlId);
                    if (cellHlName && hlDeco.virtTextPos === "overlay") {
                        if (!hlRanges.has(cellHlName)) {
                            hlRanges.set(cellHlName, []);
                        }
                        // it only has one character we don't need group like normal highlight
                        hlRanges.get(cellHlName)!.push({
                            lineS: rowIdx,
                            lineE: rowIdx,
                            colS: hlDeco.overlayPos || cellIdx,
                            colE: cellIdx + 1,
                            hl: hlDeco,
                        });
                        return;
                    }
                    if (
                        cellHlName &&
                        currHlName === cellHlName &&
                        // allow to extend prev HL if on same row and next cell OR previous row and end of range is end col
                        currHlEndRow === rowIdx &&
                        currHlEndCol === cellIdx - 1
                    ) {
                        currHlEndCol = cellIdx;
                    } else {
                        if (currHlName) {
                            if (!hlRanges.has(currHlName)) {
                                hlRanges.set(currHlName, []);
                            }
                            hlRanges.get(currHlName)!.push({
                                lineS: currHlStartRow,
                                lineE: currHlEndRow,
                                colS: currHlStartCol,
                                colE: currHlEndCol,
                            });
                            currHlName = "";
                            currHlStartCol = 0;
                            currHlEndCol = 0;
                            currHlStartRow = 0;
                            currHlEndRow = 0;
                        }
                        if (cellHlName) {
                            currHlName = cellHlName;
                            currHlStartRow = rowIdx;
                            currHlEndRow = rowIdx;
                            currHlStartCol = cellIdx;
                            currHlEndCol = cellIdx;
                        }
                    }
                });
            });
            if (currHlName) {
                if (!hlRanges.has(currHlName)) {
                    hlRanges.set(currHlName, []);
                }
                hlRanges.get(currHlName)!.push({
                    lineS: currHlStartRow,
                    lineE: currHlEndRow,
                    colS: currHlStartCol,
                    colE: currHlEndCol,
                });
            }
        }
        for (const [groupName, ranges] of hlRanges) {
            const decorator = this.getDecoratorForHighlightGroup(groupName);
            if (!decorator) {
                continue;
            }
            const decoratorRanges = ranges.map((r) => {
                if (r.hl) {
                    const conf = this.getDecoratorOptions(decorator);
                    return this.createVirtTextDecorationOption(
                        r.hl.virtText!,
                        { ...conf, backgroundColor: conf.backgroundColor || new ThemeColor("editor.background") },
                        topLine + r.lineS,
                        r.colS + 1,
                        r.colE,
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
            for (const groupName of prevHighlights) {
                if (!hlRanges.has(groupName)) {
                    const decorator = this.getDecoratorForHighlightGroup(groupName);
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

    public clearHighlights(grid: number): [TextEditorDecorationType, Range[]][] {
        const prevHighlights = this.prevGridHighlightsIds.get(grid);
        this.highlights.delete(grid);
        this.prevGridHighlightsIds.delete(grid);
        if (!prevHighlights) {
            return [];
        }
        const result: [TextEditorDecorationType, Range[]][] = [];
        for (const groupName of prevHighlights) {
            const decorator = this.getDecoratorForHighlightGroup(groupName);
            if (decorator) {
                result.push([decorator, []]);
            }
        }
        return result;
    }

    private createDecoratorForHighlightGroup(groupName: string, options: ThemableDecorationRenderOptions): void {
        const decorator = window.createTextEditorDecorationType(options);
        this.decoratorConfigurations.set(decorator, options);
        this.highlighGroupToDecorator.set(groupName, decorator);
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
                    margin: `0 0 0 -${Math.min(text.length - (col + text.length - 1 - lineLength), text.length)}ch`,
                    ...conf,
                    ...conf.before,
                    width: `${text.length}ch; position:absoulute; z-index:99;`,
                    contentText: text,
                },
            },
        };
        return textDeco;
    }
}
