import { Range, TextEditorDecorationType, ThemableDecorationRenderOptions, ThemeColor, window } from "vscode";

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

/**
 * Convert VIM HL attributes to vscode text decoration attributes
 * @param uiAttrs VIM UI attribute
 * @param vimSpecialColor Vim special color
 */
function vimHighlightToVSCodeOptions(uiAttrs: VimHighlightUIAttributes): ThemableDecorationRenderOptions {
    const options: ThemableDecorationRenderOptions = {};
    // for absent color keys color should not be changed
    if (uiAttrs.background) {
        options.backgroundColor = "#" + uiAttrs.background.toString(16);
    }
    if (uiAttrs.foreground) {
        options.color = "#" + uiAttrs.foreground.toString(16);
    }
    const specialColor = uiAttrs.special ? "#" + uiAttrs.special.toString(16) : "";

    if (uiAttrs.reverse) {
        options.backgroundColor = new ThemeColor("editor.foreground");
        options.color = new ThemeColor("editor.background");
    }
    if (uiAttrs.italic) {
        options.fontStyle = "italic";
    }
    if (uiAttrs.bold) {
        options.fontWeight = "bold";
    }
    if (uiAttrs.strikethrough) {
        options.textDecoration = "line-through solid";
    }
    if (uiAttrs.underline) {
        options.textDecoration = `underline ${specialColor} solid`;
    }
    if (uiAttrs.undercurl) {
        options.textDecoration = `underline ${specialColor} wavy`;
    }
    return options;
}

function isEditorThemeColor(s: string | ThemeColor | undefined): s is string {
    return typeof s === "string" && s.startsWith("theme.");
}

function normalizeDecorationConfig(config: ThemableDecorationRenderOptions): ThemableDecorationRenderOptions {
    const newConfig: ThemableDecorationRenderOptions = {
        ...config,
        after: config.after ? { ...config.after } : undefined,
        before: config.before ? { ...config.before } : undefined,
    };
    if (isEditorThemeColor(newConfig.backgroundColor)) {
        newConfig.backgroundColor = new ThemeColor(newConfig.backgroundColor.slice(6));
    }
    if (isEditorThemeColor(newConfig.borderColor)) {
        newConfig.borderColor = new ThemeColor(newConfig.borderColor.slice(6));
    }
    if (isEditorThemeColor(newConfig.color)) {
        newConfig.borderColor = new ThemeColor(newConfig.color.slice(6));
    }
    if (isEditorThemeColor(newConfig.outlineColor)) {
        newConfig.outlineColor = new ThemeColor(newConfig.outlineColor.slice(6));
    }
    if (isEditorThemeColor(newConfig.overviewRulerColor)) {
        newConfig.overviewRulerColor = new ThemeColor(newConfig.overviewRulerColor.slice(6));
    }
    if (newConfig.after) {
        if (isEditorThemeColor(newConfig.after.backgroundColor)) {
            newConfig.after.backgroundColor = new ThemeColor(newConfig.after.backgroundColor.slice(6));
        }
        if (isEditorThemeColor(newConfig.after.borderColor)) {
            newConfig.after.borderColor = new ThemeColor(newConfig.after.borderColor.slice(6));
        }
        if (isEditorThemeColor(newConfig.after.color)) {
            newConfig.after.color = new ThemeColor(newConfig.after.color.slice(6));
        }
    }
    if (newConfig.before) {
        if (isEditorThemeColor(newConfig.before.backgroundColor)) {
            newConfig.before.backgroundColor = new ThemeColor(newConfig.before.backgroundColor.slice(6));
        }
        if (isEditorThemeColor(newConfig.before.borderColor)) {
            newConfig.before.borderColor = new ThemeColor(newConfig.before.borderColor.slice(6));
        }
        if (isEditorThemeColor(newConfig.before.color)) {
            newConfig.before.color = new ThemeColor(newConfig.before.color.slice(6));
        }
    }
    return newConfig;
}

export class HighlightProvider {
    /**
     * Current HL. key is the grid id and values is two dimension array representing rows and cols. Array may contain empty values
     */
    private highlights: Map<number, number[][]> = new Map();
    private prevGridHighlightsIds: Map<number, Set<string>> = new Map();
    /**
     * Maps highlight id to highlight group name
     */
    private highlightIdToGroupName: Map<number, string> = new Map();
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
        "Cursor",
        "lCursor",
        "VisualNC",
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
        this.highlightIdToGroupName.set(id, name);
        if (this.highlighGroupToDecorator.has(name)) {
            // we have already precreated decorator
            return;
        } else {
            const options = this.configuration.highlights[name] || this.configuration.unknownHighlight;
            const conf = options === "vim" ? vimHighlightToVSCodeOptions(vimUiAttrs) : options;
            this.createDecoratorForHighlightGroup(name, conf);
        }
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
            const repeatTo = text === "\t" || text === "❥" ? 1 : repeat || 1;
            // const repeatTo =
            //     text === "\t" || line[cellIdx] === "\t" ? Math.ceil((repeat || tabSize) / tabSize) : repeat || 1;
            for (let i = 0; i < repeatTo; i++) {
                if (!gridHl[row]) {
                    gridHl[row] = [];
                }
                if (groupName) {
                    hasUpdates = true;
                    gridHl[row][cellIdx] = cellHlId;
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

    public getGridHighlights(grid: number, topLine: number): [TextEditorDecorationType, Range[]][] {
        const result: [TextEditorDecorationType, Range[]][] = [];
        const hlRanges: Map<string, Array<{ lineS: number; lineE: number; colS: number; colE: number }>> = new Map();
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
                rowHighlights.forEach((cellHlId, cellIdx) => {
                    const cellHlName = this.highlightIdToGroupName.get(cellHlId);
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
            const decoratorRanges = ranges.map(
                (r) => new Range(topLine + r.lineS, r.colS, topLine + r.lineE, r.colE + 1),
            );
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
}
