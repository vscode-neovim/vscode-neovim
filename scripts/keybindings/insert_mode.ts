import { createKeybindingsBuilder, vscodeKeyToVimKey } from "./util";
import type { Keybinding } from "./util";

export function getInsertModeKeybindings(): Keybinding[] {
    const { add, keybinds } = createKeybindingsBuilder();

    const ctrlKeys = [
        ..."abdefghijklmnopqrstuvwxyz/]",
        "[BracketRight]",
        "right",
        "left",
        "up",
        "down",
        "backspace",
        "delete",
    ];

    ctrlKeys.forEach((k) => {
        let cmd = "vscode-neovim.send";
        const key = `ctrl+${k}`;
        const args = vscodeKeyToVimKey(key);
        const when = [
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

    return keybinds;
}
