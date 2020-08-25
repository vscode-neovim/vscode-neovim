import vscode from "vscode";
import { NeovimClient } from "neovim";

export class CommandsController implements vscode.Disposable {
    private client: NeovimClient;

    private disposables: vscode.Disposable[] = [];

    public constructor(client: NeovimClient) {
        this.client = client;

        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-a-insert", this.ctrlAInsert));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.send", (key) => this.sendToVim(key)));
        this.disposables.push(
            vscode.commands.registerCommand("vscode-neovim.paste-register", (reg) => this.pasteFromRegister(reg)),
        );
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    private sendToVim = (keys: string): void => {
        this.client.input(keys);
    };

    private ctrlAInsert = async (): Promise<void> => {
        // Insert previously inserted text from the insert mode
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const lines: string[] = await this.client.callFunction("VSCodeGetLastInsertText");
        if (!lines.length) {
            return;
        }
        await editor.edit((b) => b.insert(editor.selection.active, lines.join("\n")));
    };

    private async pasteFromRegister(registerName: string): Promise<void> {
        // copy content from register in insert mode
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const content = await this.client.callFunction("VSCodeGetRegister", [registerName]);
        if (content === "") {
            return;
        }
        await editor.edit((b) => b.insert(editor.selection.active, content));
    }
}
