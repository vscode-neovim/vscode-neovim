const { key2arg, addKeybinds } = require("./util.cjs");

const [add, keybinds] = addKeybinds();

const when =
    "neovim.init && (editorTextFocus && neovim.mode != insert && editorLangId not in neovim.editorLangIdExclusions || neovim.recording)";

[
    "backspace",
    "shift+backspace",
    "delete",
    "shift+delete",
    "tab",
    "shift+tab",
    "down",
    "up",
    "left",
    "right",
    "shift+down",
    "shift+up",
    "shift+left",
    "shift+right",
    "home",
    "end",
].forEach((key) => add(key, when, key2arg(key)));

// Generate Ctrl keys
// const defaults = "abdefhijklortuvwxyz/]";
const ctrlKeys = [..."abcdefghijklmnopqrstuvwxyz/]", "right", "left", "up", "down", "backspace", "delete"];
ctrlKeys.forEach((k) => {
    let cmd = "vscode-neovim.send";
    let key = `ctrl+${k}`;
    let args = key2arg(key);
    let when = [
        "editorTextFocus",
        "neovim.init",
        "neovim.mode != insert",
        `neovim.ctrlKeysNormal.${k}`,
        "editorLangId not in neovim.editorLangIdExclusions",
    ].join(" && ");

    // scrolling
    if (["b", "d", "e", "f", "u", "y"].includes(k)) {
        cmd = `vscode-neovim.ctrl-${k}`;
        args = null;
    }
    // escape
    if (k === "c") {
        cmd = "vscode-neovim.escape";
        args = null;
        when += [
            " && !markersNavigationVisible",
            "!parameterHintsVisible",
            "!inReferenceSearchEditor",
            "!referenceSearchVisible",
            "!dirtyDiffVisible",
            "!notebookCellFocused",
            "!findWidgetVisible",
            "!notificationCenterVisible",
        ].join(" && ");
    }

    add(key, when, args, cmd);
});

module.exports = keybinds;
