import { createKeybindingsBuilder } from "./util.ts";
import type { Keybinding } from "./util.ts";

export function getVscodeIntegrationKeybindings(): Keybinding[] {
    const { add, keybinds } = createKeybindingsBuilder();

    add("ctrl+w", null, null, "-workbench.action.switchWindow");
    add(
        "ctrl+w ctrl+w",
        "!editorTextFocus && neovim.mode != 'cmdline' && !terminalFocus && !(filesExplorerFocus || inSearchEditor || searchViewletFocus || replaceInputBoxFocus)",
        null,
        "workbench.action.focusNextGroup",
    );

    const windowActions: [string, string][] = [
        ["ctrl+w up", "workbench.action.navigateUp"],
        ["ctrl+w k", "workbench.action.navigateUp"],
        ["ctrl+w down", "workbench.action.navigateDown"],
        ["ctrl+w j", "workbench.action.navigateDown"],
        ["ctrl+w left", "workbench.action.navigateLeft"],
        ["ctrl+w h", "workbench.action.navigateLeft"],
        ["ctrl+w right", "workbench.action.navigateRight"],
        ["ctrl+w l", "workbench.action.navigateRight"],
        ["ctrl+w =", "workbench.action.evenEditorWidths"],
        ["ctrl+w shift+-", "workbench.action.toggleEditorWidths"],
        ["ctrl+w shift+.", "workbench.action.increaseViewWidth"],
        ["ctrl+w shift+,", "workbench.action.decreaseViewWidth"],
        ["ctrl+w shift+=", "workbench.action.increaseViewHeight"],
        ["ctrl+w -", "workbench.action.decreaseViewHeight"],
        ["ctrl+w s", "workbench.action.splitEditorDown"],
        ["ctrl+w v", "workbench.action.splitEditorRight"],
    ];

    for (const [key, cmd] of windowActions) {
        add(key, "!editorTextFocus && neovim.mode != 'cmdline' && !terminalFocus", null, cmd);
    }

    const outputKeys: (string | [string, string])[] = [
        ..."abcdefghijklmnopqrstuvwxyz0123456789';/",
        ["shift+'", '"'],
        ["shift+;", ":"],
        ["shift+4", "$"],
        ["shift+5", "%"],
        ["shift+g", "G"],
        ["shift+v", "V"],
        ["shift+y", "Y"],
        ["ctrl+v", "<C-v>"],
        ["backspace", "<BS>"],
        ["delete", "<Del>"],
    ];

    for (const item of outputKeys) {
        const [key, arg] = Array.isArray(item) ? item : [item, item];
        add(
            key,
            "neovim.init && neovim.mode != insert && editorTextFocus && focusedView == workbench.panel.output",
            arg,
            "vscode-neovim.send",
        );
    }

    return keybinds;
}
