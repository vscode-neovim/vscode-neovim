// The module 'vscode' contains the VS Code extensibility APIaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

import { NVIMPluginController } from "./controller";

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const settings = vscode.workspace.getConfiguration("vscode-neovim");
    const neovimPath = process.env.NEOVIM_PATH || settings.get("neovimPath");
    if (!neovimPath) {
        vscode.window.showErrorMessage("Neovim: configure the path to neovim and restart the editor");
        return;
    }
    const highlightConfIgnore = settings.get("highlightGroups.ignoreHighlights");
    const highlightConfHighlights = settings.get("highlightGroups.highlights");
    const highlightConfUnknown = settings.get("highlightGroups.unknownHighlight");
    const mouseVisualSelection = settings.get("mouseSelectionVisualMode", false);
    const useCtrlKeysNormalMode = settings.get("useCtrlKeysForNormalMode", true);
    const useCtrlKeysInsertMode = settings.get("useCtrlKeysForInsertMode", true);
    vscode.commands.executeCommand("setContext", "neovim.ctrlKeysNormal", useCtrlKeysNormalMode);
    vscode.commands.executeCommand("setContext", "neovim.ctrlKeysInsert", useCtrlKeysInsertMode);
    const plugin = new NVIMPluginController(
        neovimPath,
        context.extensionPath,
        {
            highlights: highlightConfHighlights,
            ignoreHighlights: highlightConfIgnore,
            unknownHighlight: highlightConfUnknown,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        mouseVisualSelection,
    );
    context.subscriptions.push(plugin);
    await plugin.init();
}

// this method is called when your extension is deactivated
export function deactivate(): void {
    // ignore
}
