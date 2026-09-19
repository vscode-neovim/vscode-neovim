import { buildWhen, COMMON_NEGATED_OVERLAYS, EDITOR_CONTEXT, Keybinding } from "./util";

export function getCommonKeybindings(): Keybinding[] {
    const baseEditorWhen = buildWhen(...EDITOR_CONTEXT);
    const normalModeEscapeWhen = buildWhen(baseEditorWhen, "neovim.mode == normal", ...COMMON_NEGATED_OVERLAYS);

    return [
        {
            command: "vscode-neovim.escape",
            key: "ctrl+[",
            when: baseEditorWhen,
        },
        {
            command: "vscode-neovim.escape",
            key: "ctrl+[BracketLeft]",
            when: baseEditorWhen,
        },
        {
            command: "vscode-neovim.escape",
            key: "ctrl+c",
            when: buildWhen(normalModeEscapeWhen, "neovim.ctrlKeysNormal.c"),
        },
        {
            command: "vscode-neovim.escape",
            key: "ctrl+c",
            when: buildWhen(baseEditorWhen, "neovim.mode != normal", "neovim.ctrlKeysInsert.c"),
        },
        {
            command: "vscode-neovim.escape",
            key: "Escape",
            when: normalModeEscapeWhen,
        },
        {
            command: "vscode-neovim.escape",
            key: "Escape",
            when: buildWhen(baseEditorWhen, "neovim.mode != normal"),
        },
    ];
}
