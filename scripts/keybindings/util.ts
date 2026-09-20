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

export class KeybindingsBuilder {
    private readonly bindings: Keybinding[] = [];
    private readonly seen = new Map<string, Keybinding>();

    public add(options: AddKeybindingOptions): this {
        const entry: Keybinding = {
            key: options.key,
            command: options.command ?? "vscode-neovim.send",
        };
        if (options.when != null) entry.when = options.when;
        if (options.args != null) entry.args = options.args;

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

    public build(): Keybinding[] {
        // Normalize output fields to ensure consistent property ordering and minimize diff churn.
        return [
            ...this.bindings.map((b) => ({
                command: b.command,
                key: b.key,
                when: b.when,
                args: b.args,
            })),
        ];
    }
}
