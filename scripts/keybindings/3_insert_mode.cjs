const { key2arg, addKeybinds } = require("./util.cjs");

const [add, keybinds] = addKeybinds();

// Generate Ctrl keys
// const defaults = "adhjortuw";
// ! ctrl+c is special and is defined in common
[..."abdefghijklmnopqrstuvwxyz/]", "right", "left", "up", "down", "backspace", "delete"].forEach((k) => {
    let cmd = "vscode-neovim.send";
    let key = `ctrl+${k}`;
    let args = key2arg(key);
    let when = [
        "editorTextFocus",
        "neovim.init",
        "neovim.mode == insert",
        `neovim.ctrlKeysInsert.${k}`,
        "editorLangId not in neovim.editorLangIdExclusions",
    ].join(" && ");

    switch (k) {
        case "o":
            cmd = "vscode-neovim.escape";
            break;
        case "r":
            cmd = "vscode-neovim.send-blocking";
            break;
    }

    add(key, when, args, cmd);
});

module.exports = keybinds;
