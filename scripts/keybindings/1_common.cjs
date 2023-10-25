const keybinds = [
    {
        command: "vscode-neovim.escape",
        key: "ctrl+[",
        when: "editorTextFocus && neovim.init",
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
