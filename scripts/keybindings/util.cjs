const keymap = {
    backspace: "BS",
    delete: "Del",
    shift: "S",
    ctrl: "C",
};

/**
 *  Transform vscode key to vim key
 * @param {string} key
 */
function key2arg(key) {
    const parts = key
        .toLowerCase()
        .split("+")
        .map((i) => (keymap[i] ? keymap[i] : i));
    if (parts.length == 1) {
        return `<${parts[0]}>`;
    } else {
        return `<${parts[0]}-${parts[1]}>`;
    }
}

function and(...clauses) {
    return clauses.join(" && ");
}

function or(...clauses) {
    return clauses.join(" || ");
}

function addKeybinds() {
    const keybinds = [];
    const add = (key, when, args, command = "vscode-neovim.send") => {
        const bind = { command, key, when, args };
        if (when == null) delete bind["when"];
        if (args == null) delete bind["args"];
        keybinds.push(bind);
    };

    return [add, keybinds];
}

module.exports = { key2arg, and, or, addKeybinds };
