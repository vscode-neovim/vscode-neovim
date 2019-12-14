import * as vscode from "vscode";

import { NVIMPluginController } from "./controller";

const EXT_NAME = "vscode-neovim";
const EXT_ID = `asvetliakov.${EXT_NAME}`;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const ext = vscode.extensions.getExtension(EXT_ID)!;
    const settings = vscode.workspace.getConfiguration(EXT_NAME);
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
    const useWsl = settings.get("useWSL", false);
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
        ext.extensionKind === vscode.ExtensionKind.Workspace ? false : useWsl,
    );
    context.subscriptions.push(plugin);
    await plugin.init();
}

// this method is called when your extension is deactivated
export function deactivate(): void {
    // ignore
}
