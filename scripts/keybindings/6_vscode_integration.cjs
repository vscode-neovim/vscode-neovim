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
//    We send certain basic keys for actions like moving, selecting, and copying.
//    This allows us to easily view the output content and copy it, such as error messages.
for (const item of [
    // motion
    "h",
    "j",
    "k",
    "l",
    "w",
    "e",
    "b",
    "0",
    ["shift+4", "$"],
    ["g g", "gg"],
    ["shift+g", "G"],
    // select
    ["v", "v"],
    ["shift+v", "V"],
    ["ctrl+v", "<C-v>"],
    // copy
    "y",
    ["shift+y", "Y"],
]) {
    const [key, arg] = Array.isArray(item) ? item : [item, item];
    add(
        key,
        "neovim.init && neovim.mode == normal && editorTextFocus && focusedView == workbench.panel.output",
        arg,
        "vscode-neovim.send",
    );
}

module.exports = keybinds;
