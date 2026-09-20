import { KeybindingsBuilder, vscodeKeyToVimKey } from "./util";
import type { Keybinding } from "./util";

export function getCmdlineKeybindings(): Keybinding[] {
    const builder = new KeybindingsBuilder();
    const when = "neovim.init && neovim.mode == cmdline";

    const addCmdline = (key: string, args?: unknown, command = "vscode-neovim.send-cmdline") => {
        builder.add({ command, key, when, args });
    };

    const navigationKeys = ["tab", "shift+tab", "down", "up", "shift+down", "shift+up"];
    for (const key of navigationKeys) {
        addCmdline(key, vscodeKeyToVimKey(key));
    }

    const ctrlCmdlineKeys = [..."hwunplgtmj", "up", "down"];
    for (const k of ctrlCmdlineKeys) {
        const key = `ctrl+${k}`;
        if (k === "b") {
            addCmdline(key, undefined, "cursorHome");
        } else if (k === "e") {
            addCmdline(key, undefined, "cursorEnd");
        } else {
            addCmdline(key, vscodeKeyToVimKey(key));
        }
    }

    for (let i = 0; i < 10; i++) {
        addCmdline(`ctrl+r ${i}`, `<C-r>${i}`);
    }

    const SHIFT_KEY_TO_CMDLINE_REGISTER: Record<string, string> = {
        "'": '"',
        "+": "=",
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
        addCmdline(`ctrl+r shift+${baseKey}`, `<C-r>${regChar}`);
    }

    const ctrlAlphaKeys = [..."abcdefghijklmnopqrstuvwxyz]", "[BracketRight]"];
    for (const k of ctrlAlphaKeys) {
        const key = `ctrl+${k}`;
        addCmdline(`ctrl+r ${key}`, `<C-r>${vscodeKeyToVimKey(key)}`);
    }

    addCmdline("ctrl+r /", "<C-r>/");
    addCmdline("ctrl+r -", "<C-r>-");
    addCmdline("ctrl+r .", "<C-r>.");
    addCmdline("ctrl+r =", "<C-r>=");
    addCmdline("ctrl+\\ e", "<C-\\>e");

    return builder.build();
}
