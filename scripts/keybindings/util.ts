export interface Keybinding {
    command: string;
    key: string;
    when?: string;
    args?: unknown;
}

export interface AddKeybindingOptions {
    key: string;
    command?: string;
    when?: string | null;
    args?: unknown;
}

const VSCODE_TO_VIM_KEY_MAP: Record<string, string> = {
    backspace: "BS",
    delete: "Del",
    shift: "S",
    ctrl: "C",
    alt: "M",
    "[bracketleft]": "[",
    "[bracketright]": "]",
};

export function vscodeKeyToVimKey(key: string): string {
    const parts = key
        .toLowerCase()
        .split("+")
        .map((part) => VSCODE_TO_VIM_KEY_MAP[part] ?? part);

    return `<${parts.join("-")}>`;
}

export const COMMON_NEGATED_OVERLAYS = [
    "!markersNavigationVisible",
    "!parameterHintsVisible",
    "!inReferenceSearchEditor",
    "!referenceSearchVisible",
    "!dirtyDiffVisible",
    "!notebookCellFocused",
    "!findWidgetVisible",
    "!notificationCenterVisible",
] as const;

export const EDITOR_CONTEXT = [
    "editorTextFocus",
    "neovim.init",
    "editorLangId not in neovim.editorLangIdExclusions",
] as const;

export function buildWhen(...conditions: (string | false | null | undefined)[]): string {
    return conditions.filter(Boolean).join(" && ");
}

export class KeybindingsBuilder {
    private readonly bindings: Keybinding[] = [];
    private readonly seen = new Map<string, Keybinding>();

    public add(options: AddKeybindingOptions): this;
    public add(key: string, when?: string | null, args?: unknown, command?: string): this;
    public add(
        keyOrOptions: string | AddKeybindingOptions,
        when?: string | null,
        args?: unknown,
        command = "vscode-neovim.send",
    ): this {
        let entry: Keybinding;

        if (typeof keyOrOptions === "object") {
            entry = {
                command: keyOrOptions.command ?? "vscode-neovim.send",
                key: keyOrOptions.key,
            };
            if (keyOrOptions.when != null) entry.when = keyOrOptions.when;
            if (keyOrOptions.args != null) entry.args = keyOrOptions.args;
        } else {
            entry = { command, key: keyOrOptions };
            if (when != null) entry.when = when;
            if (args != null) entry.args = args;
        }

        const collisionKey = `${entry.command}::${entry.key}::${entry.when ?? ""}`;
        const existing = this.seen.get(collisionKey);
        if (existing) {
            throw new Error(
                `Duplicate keybinding detected:\nExisting: ${JSON.stringify(existing)}\nNew: ${JSON.stringify(entry)}`,
            );
        }
        this.seen.set(collisionKey, entry);
        this.bindings.push(entry);
        return this;
    }

    public addAll(entries: AddKeybindingOptions[]): this {
        for (const entry of entries) {
            this.add(entry);
        }
        return this;
    }

    public build(): Keybinding[] {
        return [...this.bindings];
    }
}
