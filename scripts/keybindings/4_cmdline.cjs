const { key2arg, addKeybinds } = require("./util.cjs");

const [_add, keybinds] = addKeybinds();

const add = (key, args, cmd = "vscode-neovim.send-cmdline") =>
    _add(key, "neovim.init && neovim.mode == cmdline", args, cmd);

// special keys
["tab", "shift+tab", "down", "up", "shift+down", "shift+up"].forEach((key) => add(key, key2arg(key)));

// ctrl keys
[..."hwunplgtmj", "up", "down"].forEach((k) => {
    let key = `ctrl+${k}`;
    let args = key2arg(key);

    switch (k) {
        case "b": {
            args = null;
            cmd = "cursorHome";
            break;
        }
        case "e": {
            args = null;
            cmd = "cursorEnd";
            break;
        }
    }

    add(key, args);
});

// ctrl+r number
for (let i = 0; i < 10; i++) {
    add(`ctrl+r ${i}`, `<C-r>${i}`);
}

// ctrl+r shifts
const shifts = {
    "'": '"',
    0: ")",
    1: "!",
    2: "@",
    3: "#",
    4: "$",
    5: "%",
    6: "^",
    7: "&",
    8: "*",
    9: "(",
    "+": "=",
    "-": "_",
    "=": "+",
    ";": ":",
    ",": "<",
    ".": ">",
    "/": "?",
    "`": "~",
    "[": "{",
    "]": "}",
};
for (const key in shifts) {
    add(`ctrl+r shift+${key}`, `<C-r>${shifts[key]}`);
}

// ctrl+r {ctrl+key, key}
[..."abcdefghijklmnopqrstuvwxyz]", "[BracketRight]"].forEach((k) => {
    let key = `ctrl+${k}`;
    let args = key2arg(key);
    add(`ctrl+r ${key}`, `<C-r>${args}`);
});
add("ctrl+r /", "<C-r>/");
add("ctrl+r -", "<C-r>-");
add("ctrl+r .", "<C-r>.");
add("ctrl+r =", "<C-r>=");
add("ctrl+\\ e", "<C-\\>e");

module.exports = keybinds;
