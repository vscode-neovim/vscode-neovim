import { buildWhen, EDITOR_CONTEXT, KeybindingsBuilder, vscodeKeyToVimKey } from "./util";
import type { Keybinding } from "./util";

export const CTRL_KEYS = [
    ..."abdefghijklmnopqrstuvwxyz/]",
    "[BracketRight]",
    "right",
    "left",
    "up",
    "down",
    "backspace",
    "delete",
] as const;

export function getNormalModeKeybindings(): Keybinding[] {
    const builder = new KeybindingsBuilder();

    const normalNavigationWhen =
        "neovim.init && (editorTextFocus && neovim.mode != insert && editorLangId not in neovim.editorLangIdExclusions || neovim.recording)";

    const specialNavigationKeys = [
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
    ];

    for (const key of specialNavigationKeys) {
        builder.add({
            key,
            when: normalNavigationWhen,
            args: vscodeKeyToVimKey(key),
        });
    }

    const scrollKeys = new Set(["b", "d", "e", "f", "u", "y"]);

    for (const k of CTRL_KEYS) {
        const isScroll = scrollKeys.has(k);
        const command = isScroll ? `vscode-neovim.ctrl-${k}` : "vscode-neovim.send";
        const key = `ctrl+${k}`;
        const args = isScroll ? undefined : vscodeKeyToVimKey(key);
        const when = buildWhen(
            EDITOR_CONTEXT[0],
            EDITOR_CONTEXT[1],
            "neovim.mode != insert",
            `neovim.ctrlKeysNormal.${k}`,
            EDITOR_CONTEXT[2],
        );

        builder.add({ command, key, when, args });
    }

    return builder.build();
}
