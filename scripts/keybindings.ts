import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface Keybinding {
    command: string;
    key: string;
    when?: string;
    args?: unknown;
}

interface AddKeybindingOptions {
    key: string;
    command?: string;
    when?: string | null;
    args?: unknown;
}

const VSCODE_TO_VIM_KEY_MAP: Record<string, string> = {
    backspace: "BS",
    delete: "Del",
    shift: "S",
    ctrl: "C",
    alt: "M",
    "[bracketleft]": "[",
    "[bracketright]": "]",
};

const CTRL_KEYS = [
    ..."abdefghijklmnopqrstuvwxyz/]",
    "[BracketRight]",
    "right",
    "left",
    "up",
    "down",
    "backspace",
    "delete",
] as const;

function vscodeKeyToVimKey(key: string): string {
    const parts = key
        .toLowerCase()
        .split("+")
        .map((part) => VSCODE_TO_VIM_KEY_MAP[part] ?? part);

    return `<${parts.join("-")}>`;
}

class KeybindingsBuilder {
    private readonly bindings: Keybinding[] = [];
    private readonly seen = new Map<string, Keybinding>();

    public add(options: AddKeybindingOptions): this {
        const entry: Keybinding = {
            key: options.key,
            command: options.command ?? "vscode-neovim.send",
        };
        if (options.when != null) entry.when = options.when;
        if (options.args != null) entry.args = options.args;

        const collisionKey = `${entry.command}::${entry.key}::${entry.when ?? ""}`;
        const existing = this.seen.get(collisionKey);
        if (existing) {
            throw new Error(
                `Duplicate keybinding detected:\nExisting: ${JSON.stringify(existing)}\nNew: ${JSON.stringify(entry)}`,
            );
        }
        this.seen.set(collisionKey, entry);
        this.bindings.push(entry);
        return this;
    }

    public build(): Keybinding[] {
        // Normalize output fields to ensure consistent property ordering and minimize diff churn.
        return [
            ...this.bindings.map((b) => ({
                command: b.command,
                key: b.key,
                when: b.when,
                args: b.args,
            })),
        ];
    }
}

function addCommonKeybindings(builder: KeybindingsBuilder): void {
    const COMMON_NEGATED_OVERLAYS =
        "!markersNavigationVisible && !parameterHintsVisible && !inReferenceSearchEditor && !referenceSearchVisible && !dirtyDiffVisible && !notebookCellFocused && !findWidgetVisible && !notificationCenterVisible";
    const baseEditorWhen = "editorTextFocus && neovim.init && editorLangId not in neovim.editorLangIdExclusions";
    const normalModeEscapeWhen = `${baseEditorWhen} && neovim.mode == normal && neovim.ctrlKeysNormal.c && ${COMMON_NEGATED_OVERLAYS}`;
    const normalModeEscapeKeyWhen = `${baseEditorWhen} && neovim.mode == normal && ${COMMON_NEGATED_OVERLAYS}`;

    builder.add({ command: "vscode-neovim.escape", key: "ctrl+[", when: baseEditorWhen });
    builder.add({ command: "vscode-neovim.escape", key: "ctrl+[BracketLeft]", when: baseEditorWhen });
    builder.add({ command: "vscode-neovim.escape", key: "ctrl+c", when: normalModeEscapeWhen });
    builder.add({
        command: "vscode-neovim.escape",
        key: "ctrl+c",
        when: `${baseEditorWhen} && neovim.mode != normal && neovim.ctrlKeysInsert.c`,
    });
    builder.add({ command: "vscode-neovim.escape", key: "Escape", when: normalModeEscapeKeyWhen });
    builder.add({
        command: "vscode-neovim.escape",
        key: "Escape",
        when: `${baseEditorWhen} && neovim.mode != normal`,
    });
}

function addNormalModeKeybindings(builder: KeybindingsBuilder): void {
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
        builder.add({ key, when: normalNavigationWhen, args: vscodeKeyToVimKey(key) });
    }

    const scrollKeys = new Set(["b", "d", "e", "f", "u", "y"]);

    for (const k of CTRL_KEYS) {
        const isScroll = scrollKeys.has(k);
        const command = isScroll ? `vscode-neovim.ctrl-${k}` : "vscode-neovim.send";
        const key = `ctrl+${k}`;
        const args = isScroll ? undefined : vscodeKeyToVimKey(key);
        const when = `editorTextFocus && neovim.init && neovim.mode != insert && neovim.ctrlKeysNormal.${k} && editorLangId not in neovim.editorLangIdExclusions`;

        builder.add({ command, key, when, args });
    }
}

function addInsertModeKeybindings(builder: KeybindingsBuilder): void {
    for (const k of CTRL_KEYS) {
        let command = "vscode-neovim.send";
        if (k === "o") {
            command = "vscode-neovim.escape";
        } else if (k === "r") {
            command = "vscode-neovim.send-blocking";
        }

        const key = `ctrl+${k}`;
        const args = vscodeKeyToVimKey(key);
        const when = `editorTextFocus && neovim.init && neovim.mode == insert && neovim.ctrlKeysInsert.${k} && editorLangId not in neovim.editorLangIdExclusions`;

        builder.add({ command, key, when, args });
    }
}

function addCmdlineKeybindings(builder: KeybindingsBuilder): void {
    const cmdlineWhen = "neovim.init && neovim.mode == cmdline";

    const addCmdline = (key: string, args?: unknown, command = "vscode-neovim.send-cmdline") => {
        builder.add({ command, key, when: cmdlineWhen, args });
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
}

function addWidgetsKeybindings(builder: KeybindingsBuilder): void {
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
    addList(
        "y",
        "filesExplorer.copy",
        "explorerViewletVisible && filesExplorerFocus && !explorerResourceIsRoot && !inputFocus",
    );
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
    ];
    for (const [when, nextCmd, prevCmd] of nextPrevPairs) {
        builder.add({ command: nextCmd, key: "ctrl+n", when });
        builder.add({ command: prevCmd, key: "ctrl+p", when });
    }

    builder.add({
        command: "workbench.action.closeActiveEditor",
        key: "ctrl+w q",
        when: "!editorTextFocus && neovim.mode != 'cmdline' && !terminalFocus && !filesExplorerFocus && !searchViewletFocus",
    });

    builder.add({
        command: "workbench.action.focusActiveEditorGroup",
        key: "ctrl+Escape",
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

    builder.add({
        command: "focusNextRenameSuggestion",
        key: "ctrl+n",
        when: "renameInputVisible",
    });
    builder.add({
        command: "focusPreviousRenameSuggestion",
        key: "ctrl+p",
        when: "renameInputVisible",
    });
}

function addVscodeIntegrationKeybindings(builder: KeybindingsBuilder): void {
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
}

function generateKeybindings(): Keybinding[] {
    const builder = new KeybindingsBuilder();

    addCommonKeybindings(builder);
    addNormalModeKeybindings(builder);
    addInsertModeKeybindings(builder);
    addCmdlineKeybindings(builder);
    addWidgetsKeybindings(builder);
    addVscodeIntegrationKeybindings(builder);

    return builder.build();
}

function main() {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(currentDir, "../package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    packageJson.contributes.keybindings = generateKeybindings();

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
