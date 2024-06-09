const keybinds = [
    {
        key: "j",
        command: "list.focusDown",
        when: "listFocus && !inputFocus",
    },
    {
        key: "k",
        command: "list.focusUp",
        when: "listFocus && !inputFocus",
    },
    {
        key: "h",
        command: "list.collapse",
        when: "listFocus && !inputFocus",
    },
    {
        key: "l",
        command: "list.select",
        when: "listFocus && !inputFocus",
    },
    {
        key: "enter",
        command: "list.select",
        when: "listFocus && !inputFocus && !notebookCellListFocused",
    },
    {
        key: "g g",
        command: "list.focusFirst",
        when: "listFocus && !inputFocus",
    },
    {
        key: "shift+g",
        command: "list.focusLast",
        when: "listFocus && !inputFocus",
    },
    {
        key: "o",
        command: "list.toggleExpand",
        when: "listFocus && !inputFocus",
    },
    {
        key: "ctrl+u",
        command: "list.focusPageUp",
        when: "listFocus && !inputFocus",
    },
    {
        key: "ctrl+d",
        command: "list.focusPageDown",
        when: "listFocus && !inputFocus",
    },
    {
        key: "/",
        command: "list.find",
        when: "listFocus && listSupportsFind && !inputFocus",
    },
    {
        key: "enter",
        command: "list.closeFind",
        when: "listFocus && treeFindOpen && inputFocus",
    },
    {
        key: "r",
        command: "renameFile",
        when: "explorerViewletVisible && filesExplorerFocus && !explorerResourceIsRoot && !explorerResourceReadonly && !inputFocus",
    },
    {
        key: "d",
        command: "deleteFile",
        when: "explorerViewletVisible && filesExplorerFocus && !explorerResourceReadonly && !inputFocus",
    },
    {
        key: "y",
        command: "filesExplorer.copy",
        when: "explorerViewletVisible && filesExplorerFocus && !explorerResourceIsRoot && !inputFocus",
    },
    {
        key: "x",
        command: "filesExplorer.cut",
        when: "explorerViewletVisible && filesExplorerFocus && !explorerResourceIsRoot && !inputFocus",
    },
    {
        key: "p",
        command: "filesExplorer.paste",
        when: "explorerViewletVisible && filesExplorerFocus && !explorerResourceReadonly && !inputFocus",
    },
    {
        key: "v",
        command: "explorer.openToSide",
        when: "explorerViewletFocus && explorerViewletVisible && !inputFocus",
    },
    {
        key: "a",
        command: "explorer.newFile",
        when: "filesExplorerFocus && !inputFocus",
    },
    {
        key: "shift+a",
        command: "explorer.newFolder",
        when: "filesExplorerFocus && !inputFocus",
    },
    {
        key: "shift+r",
        command: "workbench.files.action.refreshFilesExplorer",
        when: "filesExplorerFocus && !inputFocus",
    },
    {
        key: "z o",
        command: "list.expand",
        when: "!editorTextFocus && !inputFocus",
    },
    {
        key: "z shift+o",
        command: "list.expand",
        when: "!editorTextFocus && !inputFocus",
    },
    {
        key: "z c",
        command: "list.collapse",
        when: "!editorTextFocus && !inputFocus",
    },
    {
        key: "z shift+c",
        command: "list.collapseAllToFocus",
        when: "!editorTextFocus && !inputFocus",
    },
    {
        key: "z a",
        command: "list.toggleExpand",
        when: "!editorTextFocus && !inputFocus",
    },
    {
        key: "z shift+a",
        command: "list.toggleExpand",
        when: "!editorTextFocus && !inputFocus",
    },
    {
        key: "z m",
        command: "list.collapseAll",
        when: "!editorTextFocus && !inputFocus",
    },
    {
        key: "z shift+m",
        command: "list.collapseAll",
        when: "!editorTextFocus && !inputFocus",
    },
    {
        key: "tab",
        command: "togglePeekWidgetFocus",
        when: "inReferenceSearchEditor && neovim.mode == normal || referenceSearchVisible",
    },
    {
        key: "ctrl+n",
        command: "list.focusDown",
        when: "inReferenceSearchEditor && neovim.mode == normal",
    },
    {
        key: "ctrl+p",
        command: "list.focusUp",
        when: "inReferenceSearchEditor && neovim.mode == normal",
    },
    {
        command: "list.focusDown",
        key: "ctrl+n",
        when: "listFocus && !inputFocus",
    },
    {
        command: "list.focusUp",
        key: "ctrl+p",
        when: "listFocus && !inputFocus",
    },
    {
        command: "showNextParameterHint",
        key: "ctrl+n",
        when: "editorTextFocus && parameterHintsMultipleSignatures && parameterHintsVisible",
    },
    {
        command: "showPrevParameterHint",
        key: "ctrl+p",
        when: "editorTextFocus && parameterHintsMultipleSignatures && parameterHintsVisible",
    },
    {
        key: "ctrl+n",
        command: "selectNextSuggestion",
        when: "textInputFocus && suggestWidgetMultipleSuggestions && suggestWidgetVisible",
    },
    {
        key: "ctrl+p",
        command: "selectPrevSuggestion",
        when: "textInputFocus && suggestWidgetMultipleSuggestions && suggestWidgetVisible",
    },
    {
        command: "workbench.action.quickOpenSelectNext",
        key: "ctrl+n",
        when: "inQuickOpen && neovim.mode != cmdline",
    },
    {
        command: "workbench.action.quickOpenSelectPrevious",
        key: "ctrl+p",
        when: "inQuickOpen && neovim.mode != cmdline",
    },
    {
        key: "ctrl+n",
        command: "selectNextCodeAction",
        when: "codeActionMenuVisible",
    },
    {
        key: "ctrl+p",
        command: "selectPrevCodeAction",
        when: "codeActionMenuVisible",
    },
    {
        key: "ctrl+w q",
        command: "workbench.action.closeActiveEditor",
        when: "!editorTextFocus && neovim.mode != 'cmdline' && !terminalFocus && !filesExplorerFocus && !searchViewletFocus",
    },
    {
        key: "ctrl+Escape",
        command: "workbench.action.focusActiveEditorGroup",
        when: "terminalFocus",
    },

    // #region Hover Widget
    {
        command: "editor.action.showHover",
        key: "shift+k",
        when: "neovim.init && neovim.mode == normal && editorTextFocus && editorHoverVisible",
    },
    {
        command: "editor.action.pageDownHover",
        key: "ctrl+f",
        when: "editorHoverFocused",
    },
    {
        command: "editor.action.pageUpHover",
        key: "ctrl+b",
        when: "editorHoverFocused",
    },
    {
        command: "editor.action.pageDownHover",
        key: "ctrl+d",
        when: "editorHoverFocused",
    },
    {
        command: "editor.action.pageUpHover",
        key: "ctrl+u",
        when: "editorHoverFocused",
    },
    {
        command: "editor.action.scrollDownHover",
        key: "j",
        when: "editorHoverFocused",
    },
    {
        command: "editor.action.scrollUpHover",
        key: "k",
        when: "editorHoverFocused",
    },
    {
        command: "editor.action.scrollLeftHover",
        key: "h",
        when: "editorHoverFocused",
    },
    {
        command: "editor.action.scrollRightHover",
        key: "l",
        when: "editorHoverFocused",
    },
    {
        command: "editor.action.goToTopHover",
        key: "g g",
        when: "editorHoverFocused",
    },
    {
        command: "editor.action.goToBottomHover",
        key: "shift+g",
        when: "editorHoverFocused",
    },
    // #endregion
    // #region Rename Input
    {
        command: "focusNextRenameSuggestion",
        key: "ctrl+n",
        when: "renameInputVisible",
    },
    {
        command: "focusPreviousRenameSuggestion",
        key: "ctrl+p",
        when: "renameInputVisible",
    },
    // #endregion
];

module.exports = keybinds;
