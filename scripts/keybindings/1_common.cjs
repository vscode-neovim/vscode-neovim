const and = (...items) =>
    ["editorTextFocus", "neovim.init", "editorLangId not in neovim.editorLangIdExclusions", ...items].join(" && ");

const keybinds = [
    {
        command: "vscode-neovim.escape",
        key: "ctrl+[",
        when: and(),
    },
    {
        command: "vscode-neovim.escape",
        key: "ctrl+c",
        when: and(
            "neovim.mode == normal",
            "neovim.ctrlKeysNormal.c",

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
        when: and("neovim.mode != normal", "neovim.ctrlKeysInsert.c"),
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

module.exports = keybinds;
