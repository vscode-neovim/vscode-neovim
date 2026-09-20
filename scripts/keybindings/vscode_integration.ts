import { KeybindingsBuilder } from "./util";
import type { Keybinding } from "./util";

export function getVscodeIntegrationKeybindings(): Keybinding[] {
    const builder = new KeybindingsBuilder();

    builder.add({
        command: "-workbench.action.switchWindow",
        key: "ctrl+w",
    });

    builder.add({
        command: "workbench.action.focusNextGroup",
        key: "ctrl+w ctrl+w",
        when: "!editorTextFocus && neovim.mode != 'cmdline' && !terminalFocus && !(filesExplorerFocus || inSearchEditor || searchViewletFocus || replaceInputBoxFocus)",
    });

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

    const windowActionWhen = "!editorTextFocus && neovim.mode != 'cmdline' && !terminalFocus";
    for (const [key, command] of windowActions) {
        builder.add({ key, when: windowActionWhen, command });
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

    const outputWhen =
        "neovim.init && neovim.mode != insert && editorTextFocus && focusedView == workbench.panel.output";

    for (const item of outputKeys) {
        const [key, arg] = Array.isArray(item) ? item : [item, item];
        builder.add({
            command: "vscode-neovim.send",
            key,
            when: outputWhen,
            args: arg,
        });
    }

    return builder.build();
}
