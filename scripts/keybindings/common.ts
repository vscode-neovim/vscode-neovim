import type { Keybinding } from "./util";

const COMMON_NEGATED_OVERLAYS =
    "!markersNavigationVisible && !parameterHintsVisible && !inReferenceSearchEditor && !referenceSearchVisible && !dirtyDiffVisible && !notebookCellFocused && !findWidgetVisible && !notificationCenterVisible";

export function getCommonKeybindings(): Keybinding[] {
    const baseEditorWhen = "editorTextFocus && neovim.init && editorLangId not in neovim.editorLangIdExclusions";
    const normalModeEscapeWhen = `${baseEditorWhen} && neovim.mode == normal && neovim.ctrlKeysNormal.c && ${COMMON_NEGATED_OVERLAYS}`;
    const normalModeEscapeKeyWhen = `${baseEditorWhen} && neovim.mode == normal && ${COMMON_NEGATED_OVERLAYS}`;

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
            when: normalModeEscapeWhen,
        },
        {
            command: "vscode-neovim.escape",
            key: "ctrl+c",
            when: `${baseEditorWhen} && neovim.mode != normal && neovim.ctrlKeysInsert.c`,
        },
        {
            command: "vscode-neovim.escape",
            key: "Escape",
            when: normalModeEscapeKeyWhen,
        },
        {
            command: "vscode-neovim.escape",
            key: "Escape",
            when: `${baseEditorWhen} && neovim.mode != normal`,
        },
    ];
}
