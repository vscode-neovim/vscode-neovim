import * as vscode from "vscode";

import { MainController } from "./main_controller";
import { getNeovimPath, getNeovimInitPath, EXT_ID, EXT_NAME } from "./utils";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const ext = vscode.extensions.getExtension(EXT_ID)!;
    const settings = vscode.workspace.getConfiguration(EXT_NAME);
    const neovimPath = getNeovimPath();
    const isWindows = process.platform == "win32";

    const highlightConfIgnore = settings.get("highlightGroups.ignoreHighlights");
    const highlightConfHighlights = settings.get("highlightGroups.highlights");
    const highlightConfUnknown = settings.get("highlightGroups.unknownHighlight");
    const mouseVisualSelection = settings.get("mouseSelectionStartVisualMode", false);
    const useCtrlKeysNormalMode = settings.get("useCtrlKeysForNormalMode", true);
    const useCtrlKeysInsertMode = settings.get("useCtrlKeysForInsertMode", true);
    const useWsl = isWindows && settings.get("useWSL", false);
    const revealCursorScrollLine = settings.get("revealCursorScrollLine", false);
    const neovimWidth = settings.get("neovimWidth", 1000);
    const neovimViewportHeightExtend = settings.get("neovimViewportHeightExtend", 1);
    const customInit = getNeovimInitPath() ?? "";
    const clean = settings.get("neovimClean", false);
    const logPath = settings.get("logPath", "");
    const logLevel = settings.get("logLevel", "none");
    const outputToConsole = settings.get("logOutputToConsole", false);

    vscode.commands.executeCommand("setContext", "neovim.ctrlKeysNormal", useCtrlKeysNormalMode);
    vscode.commands.executeCommand("setContext", "neovim.ctrlKeysInsert", useCtrlKeysInsertMode);

    try {
        const plugin = new MainController({
            customInitFile: customInit,
            clean: clean,
            extensionPath: context.extensionPath.replace(/\\/g, "\\\\"),
            highlightsConfiguration: {
                highlights: highlightConfHighlights,
                ignoreHighlights: highlightConfIgnore,
                unknownHighlight: highlightConfUnknown,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any,
            mouseSelection: mouseVisualSelection,
            neovimPath: neovimPath,
            useWsl: ext.extensionKind === vscode.ExtensionKind.Workspace ? false : useWsl,
            neovimViewportWidth: neovimWidth,
            neovimViewportHeightExtend: neovimViewportHeightExtend,
            revealCursorScrollLine: revealCursorScrollLine,
            logConf: {
                logPath,
                outputToConsole,
                level: logLevel,
            },
        });
        context.subscriptions.push(plugin);
        await plugin.init();
    } catch (e) {
        vscode.window.showErrorMessage(`Unable to init vscode-neovim: ${(e as Error).message}`);
    }
}

// this method is called when your extension is deactivated
export function deactivate(): void {
    // ignore
}
