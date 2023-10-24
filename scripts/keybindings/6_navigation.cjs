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
];

module.exports = keybinds;
