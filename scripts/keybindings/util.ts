export interface Keybinding {
    command: string;
    key: string;
    when?: string;
    args?: unknown;
}

const VSCODE_TO_VIM_KEY_MAP: Record<string, string> = {
    backspace: "BS",
    delete: "Del",
    shift: "S",
    ctrl: "C",
    "[bracketleft]": "[",
    "[bracketright]": "]",
};

export function vscodeKeyToVimKey(key: string): string {
    const parts = key
        .toLowerCase()
        .split("+")
        .map((part) => VSCODE_TO_VIM_KEY_MAP[part] ?? part);

    if (parts.length === 1) {
        return `<${parts[0]}>`;
    }
    return `<${parts[0]}-${parts[1]}>`;
}

export function createKeybindingsBuilder() {
    const keybinds: Keybinding[] = [];
    const seen = new Map<string, Keybinding>();

    const add = (key: string, when?: string | null, commandArgs?: unknown, command = "vscode-neovim.send") => {
        const bind: Keybinding = { command, key };
        if (when != null) bind.when = when;
        if (commandArgs != null) bind.args = commandArgs;

        const dedupeKey = `${command}::${key}::${when ?? ""}`;
        const existing = seen.get(dedupeKey);
        if (existing) {
            throw new Error(
                `Duplicate keybinding detected:\nExisting: ${JSON.stringify(existing)}\nNew: ${JSON.stringify(bind)}`,
            );
        }
        seen.set(dedupeKey, bind);
        keybinds.push(bind);
    };

    return { add, keybinds };
}
