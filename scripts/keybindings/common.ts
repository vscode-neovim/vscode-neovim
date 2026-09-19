import type { Keybinding } from "./util";

const and = (...items: string[]) =>
    ["editorTextFocus", "neovim.init", "editorLangId not in neovim.editorLangIdExclusions", ...items].join(" && ");

export function getCommonKeybindings(): Keybinding[] {
    return [
        {
            command: "vscode-neovim.escape",
            key: "ctrl+[",
            when: and(),
        },
        {
            command: "vscode-neovim.escape",
            key: "ctrl+[BracketLeft]", // fix ctrl+[ mapping on macOS non-US keyboard layout
            when: and(),
        },
        {
            command: "vscode-neovim.escape",
            key: "ctrl+c",
            when: and(
                "neovim.mode == normal",
                "neovim.ctrlKeysNormal.c", // special case!

                "!markersNavigationVisible",
                "!parameterHintsVisible",
                "!inReferenceSearchEditor",
                "!referenceSearchVisible",
                "!dirtyDiffVisible",
                "!notebookCellFocused",
                "!findWidgetVisible",
                "!notificationCenterVisible",
            ),
        },
        {
            command: "vscode-neovim.escape",
            key: "ctrl+c",
            when: and(
                "neovim.mode != normal",
                "neovim.ctrlKeysInsert.c", // special case!
            ),
        },
        {
            command: "vscode-neovim.escape",
            key: "Escape",
            when: and(
                "neovim.mode == normal",

                "!markersNavigationVisible",
                "!parameterHintsVisible",
                "!inReferenceSearchEditor",
                "!referenceSearchVisible",
                "!dirtyDiffVisible",
                "!notebookCellFocused",
                "!findWidgetVisible",
                "!notificationCenterVisible",
            ),
        },
        {
            command: "vscode-neovim.escape",
            key: "Escape",
            when: and("neovim.mode != normal"),
        },
    ];
}
