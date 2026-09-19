import { createKeybindingsBuilder, vscodeKeyToVimKey } from "./util";
import type { Keybinding } from "./util";

export function getCmdlineKeybindings(): Keybinding[] {
    const { add: _add, keybinds } = createKeybindingsBuilder();

    const add = (key: string, commandArgs?: unknown, command = "vscode-neovim.send-cmdline") =>
        _add(key, "neovim.init && neovim.mode == cmdline", commandArgs, command);

    // special keys
    ["tab", "shift+tab", "down", "up", "shift+down", "shift+up"].forEach((key) => add(key, vscodeKeyToVimKey(key)));

    // ctrl keys
    [..."hwunplgtmj", "up", "down"].forEach((k) => {
        const key = `ctrl+${k}`;
        let args: string | null = vscodeKeyToVimKey(key);
        let cmd = "vscode-neovim.send-cmdline";

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

        add(key, args, cmd);
    });

    // ctrl+r number
    for (let i = 0; i < 10; i++) {
        add(`ctrl+r ${i}`, `<C-r>${i}`);
    }

    // Map base physical key pressed with Shift to its Neovim command-line register character
    const SHIFT_KEY_TO_CMDLINE_REGISTER: Record<string, string> = {
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
    for (const [baseKey, regChar] of Object.entries(SHIFT_KEY_TO_CMDLINE_REGISTER)) {
        add(`ctrl+r shift+${baseKey}`, `<C-r>${regChar}`);
    }

    // ctrl+r {ctrl+key, key}
    [..."abcdefghijklmnopqrstuvwxyz]", "[BracketRight]"].forEach((k) => {
        const key = `ctrl+${k}`;
        const args = vscodeKeyToVimKey(key);
        add(`ctrl+r ${key}`, `<C-r>${args}`);
    });
    add("ctrl+r /", "<C-r>/");
    add("ctrl+r -", "<C-r>-");
    add("ctrl+r .", "<C-r>.");
    add("ctrl+r =", "<C-r>=");
    add("ctrl+\\ e", "<C-\\>e");

    return keybinds;
}
