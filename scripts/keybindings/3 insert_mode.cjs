const { key2arg, and, addKeybinds } = require("./util.cjs");

const [add, keybinds] = addKeybinds();

// Generate Ctrl keys
// const defaults = "adhjortuw";
[..."abcdefghijklmnopqrstuvwxyz/]", "right", "left", "up", "down", "backspace", "delete"].forEach((k) => {
    let cmd = "vscode-neovim.send";
    let key = `ctrl+${k}`;
    let args = key2arg(key);
    let when = and(
        "editorTextFocus",
        "neovim.init",
        "neovim.mode == insert",
        `neovim.ctrlKeysInsert.${k}`,
        "editorLangId not in neovim.editorLangIdExclusions",
    );

    if (k === "o") {
        cmd = "vscode-neovim.escape";
    } else if (k === "r") {
        cmd = "vscode-neovim.send-blocking";
    }

    add(key, when, args, cmd);
});

module.exports = keybinds;
