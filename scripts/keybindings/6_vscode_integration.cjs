const keybinds = [
    {
        key: "ctrl+w",
        command: "-workbench.action.switchWindow",
    },
    {
        key: "ctrl+w ctrl+w",
        command: "workbench.action.focusNextGroup",
        when: "!editorTextFocus && !terminalFocus && !(filesExplorerFocus || inSearchEditor || searchViewletFocus || replaceInputBoxFocus)",
    },
    {
        key: "ctrl+w ctrl+w",
        command: "workbench.action.focusFirstEditorGroup",
        when: "!editorTextFocus && !terminalFocus && !(filesExplorerFocus || inSearchEditor || searchViewletFocus || replaceInputBoxFocus)",
    },
    {
        key: "ctrl+w up",
        command: "workbench.action.navigateUp",
        when: "!editorTextFocus && !terminalFocus",
    },
    {
        key: "ctrl+w k",
        command: "workbench.action.navigateUp",
        when: "!editorTextFocus && !terminalFocus",
    },
    {
        key: "ctrl+w down",
        command: "workbench.action.navigateDown",
        when: "!editorTextFocus && !terminalFocus",
    },
    {
        key: "ctrl+w j",
        command: "workbench.action.navigateDown",
        when: "!editorTextFocus && !terminalFocus",
    },
    {
        key: "ctrl+w left",
        command: "workbench.action.navigateLeft",
        when: "!editorTextFocus && !terminalFocus",
    },
    {
        key: "ctrl+w h",
        command: "workbench.action.navigateLeft",
        when: "!editorTextFocus && !terminalFocus",
    },
    {
        key: "ctrl+w right",
        command: "workbench.action.navigateRight",
        when: "!editorTextFocus && !terminalFocus",
    },
    {
        key: "ctrl+w l",
        command: "workbench.action.navigateRight",
        when: "!editorTextFocus && !terminalFocus",
    },
    {
        key: "ctrl+w =",
        command: "workbench.action.evenEditorWidths",
        when: "!editorTextFocus",
    },
    {
        key: "ctrl+w _",
        command: "workbench.action.toggleEditorWidths",
        when: "!editorTextFocus",
    },
    {
        key: "ctrl+w >",
        command: "workbench.action.increaseViewWidth",
        when: "!editorTextFocus",
    },
    {
        key: "ctrl+w <",
        command: "workbench.action.decreaseViewWidth",
        when: "!editorTextFocus",
    },
    {
        key: "ctrl+w +",
        command: "workbench.action.increaseViewHeight",
        when: "!editorTextFocus",
    },
    {
        key: "ctrl+w -",
        command: "workbench.action.decreaseViewHeight",
        when: "!editorTextFocus",
    },
    {
        key: "ctrl+w s",
        command: "workbench.action.splitEditorDown",
        when: "!editorTextFocus",
    },
    {
        key: "ctrl+w v",
        command: "workbench.action.splitEditorRight",
        when: "!editorTextFocus",
    },
];

module.exports = keybinds;
