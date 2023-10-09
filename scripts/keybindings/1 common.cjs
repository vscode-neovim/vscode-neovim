const keybinds = [
    {
        command: "vscode-neovim.escape",
        key: "ctrl+[",
        when: "editorTextFocus && neovim.init",
    },
    {
        command: "vscode-neovim.escape",
        key: "ctrl+c",
        when: "editorTextFocus && neovim.init && neovim.mode == normal && neovim.ctrlKeysNormal && !markersNavigationVisible && !parameterHintsVisible && !inReferenceSearchEditor && !referenceSearchVisible && !dirtyDiffVisible && !notebookCellFocused && !findWidgetVisible && !notificationCenterVisible",
    },
    {
        command: "vscode-neovim.escape",
        key: "ctrl+c",
        when: "editorTextFocus && neovim.init && neovim.mode != normal && neovim.ctrlKeysInsert",
    },
    {
        command: "vscode-neovim.escape",
        key: "Escape",
        when: "editorTextFocus && neovim.init && neovim.mode == normal && !markersNavigationVisible && !parameterHintsVisible && !inReferenceSearchEditor && !referenceSearchVisible && !dirtyDiffVisible && !notebookCellFocused && !findWidgetVisible && !notificationCenterVisible",
    },
    {
        command: "vscode-neovim.escape",
        key: "Escape",
        when: "editorTextFocus && neovim.init && neovim.mode != normal",
    },
];

module.exports = keybinds;
