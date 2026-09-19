import { createKeybindingsBuilder, vscodeKeyToVimKey } from "./util";
import type { Keybinding } from "./util";

export function getNormalModeKeybindings(): Keybinding[] {
    const { add, keybinds } = createKeybindingsBuilder();

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
    ].forEach((key) => add(key, when, vscodeKeyToVimKey(key)));

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
        let args: string | null = vscodeKeyToVimKey(key);
        const ctrlWhen = [
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

        add(key, ctrlWhen, args, cmd);
    });

    return keybinds;
}
