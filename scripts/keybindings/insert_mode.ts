import { CTRL_KEYS } from "./normal_mode";
import { buildWhen, EDITOR_CONTEXT, KeybindingsBuilder, vscodeKeyToVimKey } from "./util";
import type { Keybinding } from "./util";

export function getInsertModeKeybindings(): Keybinding[] {
    const builder = new KeybindingsBuilder();

    for (const k of CTRL_KEYS) {
        let command = "vscode-neovim.send";
        if (k === "o") {
            command = "vscode-neovim.escape";
        } else if (k === "r") {
            command = "vscode-neovim.send-blocking";
        }

        const key = `ctrl+${k}`;
        const args = vscodeKeyToVimKey(key);
        const when = buildWhen(
            EDITOR_CONTEXT[0],
            EDITOR_CONTEXT[1],
            "neovim.mode == insert",
            `neovim.ctrlKeysInsert.${k}`,
            EDITOR_CONTEXT[2],
        );

        builder.add({ command, key, when, args });
    }

    return builder.build();
}
