import * as vscode from "vscode";

import { config } from "./config";
import { MainController } from "./main_controller";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(config);
    try {
        const plugin = new MainController(context.extensionPath.replace(/\\/g, "\\\\"));
        context.subscriptions.push(plugin);
        await plugin.init();
    } catch (e) {
        vscode.window.showErrorMessage(`Unable to init vscode-neovim: ${(e as Error).message}`);
    }
}

export function deactivate(): void {
    // ignore
}
