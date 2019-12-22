import { Range, TextEditorDecorationType, ThemableDecorationRenderOptions, ThemeColor, window } from "vscode";

type Cols = Set<number>;
type ColHiglights = Map<number, Cols>;
type TypeHighlights = Map<string, ColHiglights>;
type GridHighligts = Map<number, TypeHighlights>;

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
function vimHighlightToVSCodeOptions(
    uiAttrs: VimHighlightUIAttributes,
    vimSpecialColor: string,
): ThemableDecorationRenderOptions {
    const options: ThemableDecorationRenderOptions = {};
    // for absent color keys default color should be used
    options.backgroundColor = uiAttrs.background
        ? "#" + uiAttrs.background.toString(16)
        : new ThemeColor("editor.background");
    options.color = uiAttrs.foreground ? "#" + uiAttrs.foreground.toString(16) : new ThemeColor("editor.foreground");
    const specialColor = uiAttrs.special ? "#" + uiAttrs.special.toString(16) : vimSpecialColor;

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
     * Stores current highlights from various groups for document uri
     */
    private gridHighlights: GridHighligts = new Map();
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

    private specialColor = "orange";
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
            this.configuration.ignoreHighlights.find(i =>
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
            const conf = options === "vim" ? vimHighlightToVSCodeOptions(vimUiAttrs, this.specialColor) : options;
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

    public add(grid: number, type: string, row: number, col: number): void {
        let gridHighlights = this.gridHighlights.get(grid);
        if (!gridHighlights) {
            gridHighlights = new Map();
            this.gridHighlights.set(grid, gridHighlights);
        }
        let typeHighlights = gridHighlights.get(type);
        if (!typeHighlights) {
            typeHighlights = new Map();
            gridHighlights.set(type, typeHighlights);
        }

        let rowHighlights = typeHighlights.get(row);
        if (!rowHighlights) {
            rowHighlights = new Set();
            typeHighlights.set(row, rowHighlights);
        }

        rowHighlights.add(col);
    }

    public remove(grid: number, row: number, col: number): void {
        const gridHighlights = this.gridHighlights.get(grid);
        if (!gridHighlights) {
            return;
        }
        for (const [, typeHighlights] of gridHighlights) {
            const rowHighlights = typeHighlights.get(row);
            if (!rowHighlights) {
                continue;
            }
            rowHighlights.delete(col);
        }
    }

    public removeLine(grid: number, row: number): void {
        const gridHighlights = this.gridHighlights.get(grid);
        if (!gridHighlights) {
            return;
        }
        for (const [, typeHighlights] of gridHighlights) {
            typeHighlights.delete(row);
        }
    }

    public clean(grid: number): void {
        const gridHighlights = this.gridHighlights.get(grid);
        if (!gridHighlights) {
            return;
        }
        for (const [, hls] of gridHighlights) {
            hls.clear();
        }
    }

    public provideGridHighlights(grid: number): [TextEditorDecorationType, Range[]][] {
        const gridHighlights = this.gridHighlights.get(grid);
        if (!gridHighlights) {
            return [];
        }

        const result: [TextEditorDecorationType, Range[]][] = [];
        for (const [groupName, decorator] of this.highlighGroupToDecorator) {
            if (!decorator) {
                continue;
            }

            const typeHighlights = gridHighlights.get(groupName);
            if (!typeHighlights) {
                continue;
            }
            const ranges: Range[] = [];
            for (const [row, cols] of typeHighlights) {
                const rowRanges = this.createRangeFromCols(row, [...cols]);
                if (rowRanges) {
                    ranges.push(...rowRanges);
                }
            }
            result.push([decorator, ranges]);
        }
        return result;
    }

    private createRangeFromCols(row: number, cols: number[]): Range[] | undefined {
        if (!cols.length) {
            return;
        }
        const ranges: Range[] = [];
        const sortedCols = cols.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        for (let i = 0; i < sortedCols.length; i++) {
            const startCol = sortedCols[i];
            let skipCol = startCol;
            // skip until range won't overlap, e.g. if there are 1, 2, 3, 5, 6, 7, we'll skil 2 and 6
            while (skipCol + 1 === sortedCols[i + 1]) {
                skipCol = sortedCols[i + 1];
                i++;
                continue;
            }
            const endCol = sortedCols[i];
            ranges.push(new Range(row, startCol, row, endCol + 1));
        }
        return ranges;
    }

    private createDecoratorForHighlightGroup(groupName: string, options: ThemableDecorationRenderOptions): void {
        const decorator = window.createTextEditorDecorationType(options);
        this.decoratorConfigurations.set(decorator, options);
        this.highlighGroupToDecorator.set(groupName, decorator);
    }
}
