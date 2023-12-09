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

// - Why do we need to manually send keys?
//    The output panel is not a "real" text editor, it cannot receive regular keyboard inputs.
// - Why do we send these keys?
//    This allows us to easily view the output content and copy it, such as error messages.
for (const item of [
    ..."abcdefghijklmnopqrstuvwxyz0123456789';/",
    ["shift+'", '"'],
    ["shift+;", ":"],
    ["shift+4", "$"],
    ["shift+5", "%"],
    ["shift+g", "G"],
    ["shift+v", "V"],
    ["shift+y", "Y"],
    ["ctrl+v", "<C-v>"],
    ["backspace", "<BS>"],
    ["delete", "<Del>"],
]) {
    const [key, arg] = Array.isArray(item) ? item : [item, item];
    add(
        key,
        "neovim.init && neovim.mode != insert && editorTextFocus && focusedView == workbench.panel.output",
        arg,
        "vscode-neovim.send",
    );
}

module.exports = keybinds;
