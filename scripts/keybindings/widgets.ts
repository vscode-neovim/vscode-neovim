import { KeybindingsBuilder } from "./util";
import type { Keybinding } from "./util";

export function getWidgetsKeybindings(): Keybinding[] {
    const builder = new KeybindingsBuilder();

    const addList = (key: string, command: string, when = "listFocus && !inputFocus") => {
        builder.add({ key, command, when });
    };

    addList("j", "list.focusDown");
    addList("k", "list.focusUp");
    addList("h", "list.collapse");
    addList("l", "list.select");
    addList("enter", "list.select", "listFocus && !inputFocus && !notebookCellListFocused");
    addList("g g", "list.focusFirst");
    addList("shift+g", "list.focusLast");
    addList("o", "list.toggleExpand");
    addList("ctrl+u", "list.focusPageUp");
    addList("ctrl+d", "list.focusPageDown");
    addList("/", "list.find", "listFocus && listSupportsFind && !inputFocus");
    addList("enter", "list.closeFind", "listFocus && treeFindOpen && inputFocus");

    const explorerWhen =
        "explorerViewletVisible && filesExplorerFocus && !explorerResourceIsRoot && !explorerResourceReadonly && !inputFocus";
    addList("r", "renameFile", explorerWhen);
    addList(
        "d",
        "deleteFile",
        "explorerViewletVisible && filesExplorerFocus && !explorerResourceReadonly && !inputFocus",
    );
    addList("y", "filesExplorer.copy", explorerWhen);
    addList("x", "filesExplorer.cut", explorerWhen);
    addList(
        "p",
        "filesExplorer.paste",
        "explorerViewletVisible && filesExplorerFocus && !explorerResourceReadonly && !inputFocus",
    );
    addList("v", "explorer.openToSide", "explorerViewletFocus && explorerViewletVisible && !inputFocus");
    addList("a", "explorer.newFile", "filesExplorerFocus && !inputFocus");
    addList("shift+a", "explorer.newFolder", "filesExplorerFocus && !inputFocus");
    addList("shift+r", "workbench.files.action.refreshFilesExplorer", "filesExplorerFocus && !inputFocus");

    const foldingWhen = "!editorTextFocus && !inputFocus && listFocus";
    const foldBindings: [string, string][] = [
        ["z o", "list.expand"],
        ["z shift+o", "list.expand"],
        ["z c", "list.collapse"],
        ["z shift+c", "list.collapseAllToFocus"],
        ["z a", "list.toggleExpand"],
        ["z shift+a", "list.toggleExpand"],
        ["z m", "list.collapseAll"],
        ["z shift+m", "list.collapseAll"],
    ];
    for (const [key, command] of foldBindings) {
        addList(key, command, foldingWhen);
    }

    addList(
        "tab",
        "togglePeekWidgetFocus",
        "inReferenceSearchEditor && neovim.mode == normal || referenceSearchVisible",
    );

    const nextPrevPairs: [string, string, string][] = [
        ["inReferenceSearchEditor && neovim.mode == normal", "list.focusDown", "list.focusUp"],
        ["listFocus && !inputFocus", "list.focusDown", "list.focusUp"],
        [
            "editorTextFocus && parameterHintsMultipleSignatures && parameterHintsVisible",
            "showNextParameterHint",
            "showPrevParameterHint",
        ],
        [
            "textInputFocus && suggestWidgetMultipleSuggestions && suggestWidgetVisible",
            "selectNextSuggestion",
            "selectPrevSuggestion",
        ],
        [
            "inQuickOpen && neovim.mode != cmdline",
            "workbench.action.quickOpenSelectNext",
            "workbench.action.quickOpenSelectPrevious",
        ],
        ["codeActionMenuVisible", "selectNextCodeAction", "selectPrevCodeAction"],
        ["renameInputVisible", "focusNextRenameSuggestion", "focusPreviousRenameSuggestion"],
    ];
    for (const [when, nextCmd, prevCmd] of nextPrevPairs) {
        builder.add({ key: "ctrl+n", command: nextCmd, when });
        builder.add({ key: "ctrl+p", command: prevCmd, when });
    }

    builder.add({
        key: "ctrl+w q",
        command: "workbench.action.closeActiveEditor",
        when: "!editorTextFocus && neovim.mode != 'cmdline' && !terminalFocus && !filesExplorerFocus && !searchViewletFocus",
    });

    builder.add({
        key: "ctrl+Escape",
        command: "workbench.action.focusActiveEditorGroup",
        when: "terminalFocus",
    });

    builder.add({
        command: "editor.action.showHover",
        key: "shift+k",
        when: "neovim.init && neovim.mode == normal && editorTextFocus && editorHoverVisible",
    });

    const hoverNavigation: [string, string][] = [
        ["ctrl+f", "editor.action.pageDownHover"],
        ["ctrl+b", "editor.action.pageUpHover"],
        ["ctrl+d", "editor.action.pageDownHover"],
        ["ctrl+u", "editor.action.pageUpHover"],
        ["j", "editor.action.scrollDownHover"],
        ["k", "editor.action.scrollUpHover"],
        ["h", "editor.action.scrollLeftHover"],
        ["l", "editor.action.scrollRightHover"],
        ["g g", "editor.action.goToTopHover"],
        ["shift+g", "editor.action.goToBottomHover"],
    ];
    for (const [key, command] of hoverNavigation) {
        builder.add({ key, command, when: "editorHoverFocused" });
    }

    return builder.build();
}
