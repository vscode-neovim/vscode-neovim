import {
    DecorationRangeBehavior,
    Disposable,
    TextEditorDecorationType,
    ThemableDecorationRenderOptions,
    ThemeColor,
    window,
} from "vscode";

import { disposeAll } from "../utils";
import { config } from "../config";

interface VimHighlightUIAttributes {
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

interface HighlightConfiguration {
    /**
     * Map specific highlight to use vscode decorator configuration
     */
    highlights: {
        [key: string]: ThemableDecorationRenderOptions;
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

export class HighlightGroupManager implements Disposable {
    private disposables: Disposable[] = [];

    /**
     * HL group id to text decorator
     */
    private highlighIdToDecorator: Map<number, TextEditorDecorationType> = new Map();
    /**
     * Store configuration per decorator
     */
    private decoratorConfigurations: Map<TextEditorDecorationType, ThemableDecorationRenderOptions> = new Map();

    // Treat all colors mixed with Visual as Visual to avoid defective rendering due to disjointed decoration ranges.
    private visualHighlightId?: number;
    private visualHighlightIds: number[] = [];

    private configuration: HighlightConfiguration;

    constructor() {
        const highlights: HighlightConfiguration["highlights"] = {};
        for (const [key, opts] of Object.entries(config.highlights)) {
            highlights[key] = normalizeDecorationConfig(opts);
        }
        this.configuration = { highlights };
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
        this.disposables.push(decorator);
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

    public getDecorator(
        hlId: number,
    ):
        | { decorator: TextEditorDecorationType; options: ThemableDecorationRenderOptions }
        | { decorator: undefined; options: undefined } {
        const decorator = this.highlighIdToDecorator.get(hlId);
        if (decorator) return { decorator, options: this.decoratorConfigurations.get(decorator)! };
        return { decorator: undefined, options: undefined };
    }

    public normalizeHighlightId(hlId: number): number {
        return this.visualHighlightId && this.visualHighlightIds.includes(hlId) ? this.visualHighlightId : hlId;
    }

    dispose() {
        disposeAll(this.disposables);
    }
}
