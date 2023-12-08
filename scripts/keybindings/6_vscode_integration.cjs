const { addKeybinds } = require("./util.cjs");

const [add, keybinds] = addKeybinds();

add("ctrl+w", null, null, "-workbench.action.switchWindow");
add(
    "ctrl+w ctrl+w",
    "!editorTextFocus && !terminalFocus && !(filesExplorerFocus || inSearchEditor || searchViewletFocus || replaceInputBoxFocus)",
    null,
    "workbench.action.focusNextGroup",
);
for (const [key, cmd] of [
    ["ctrl+w up", "workbench.action.navigateUp"],
    ["ctrl+w k", "workbench.action.navigateUp"],
    ["ctrl+w down", "workbench.action.navigateDown"],
    ["ctrl+w j", "workbench.action.navigateDown"],
    ["ctrl+w left", "workbench.action.navigateLeft"],
    ["ctrl+w h", "workbench.action.navigateLeft"],
    ["ctrl+w right", "workbench.action.navigateRight"],
    ["ctrl+w l", "workbench.action.navigateRight"],
    ["ctrl+w =", "workbench.action.evenEditorWidths"],
    ["ctrl+w _", "workbench.action.toggleEditorWidths"],
    ["ctrl+w >", "workbench.action.increaseViewWidth"],
    ["ctrl+w <", "workbench.action.decreaseViewWidth"],
    ["ctrl+w +", "workbench.action.increaseViewHeight"],
    ["ctrl+w -", "workbench.action.decreaseViewHeight"],
    ["ctrl+w s", "workbench.action.splitEditorDown"],
    ["ctrl+w v", "workbench.action.splitEditorRight"],
]) {
    add(key, "!editorTextFocus && !terminalFocus", null, cmd);
}

module.exports = keybinds;
