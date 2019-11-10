import vscode from "vscode";
import { NeovimClient } from "neovim";

const insertRegisterNames: string[] = [
    "0",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    '"',
    "%",
    "#",
    "*",
    "+",
    ":",
    ".",
    "-",
    "=",
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
];

const keyMappings = {
    // "ctrl-b": "<C-b>",
    // "ctrl-f": "<C-f>",
    // "ctrl-u": "<C-u>",
    // "ctrl-d": "<C-d>",
    "ctrl-r": "<C-r>",
    "ctrl-v": "<C-v>",
};

export class CommandsController implements vscode.Disposable {
    private client: NeovimClient;

    private disposables: vscode.Disposable[] = [];

    public constructor(client: NeovimClient) {
        this.client = client;

        for (const [key, vimKey] of Object.entries(keyMappings)) {
            this.disposables.push(
                vscode.commands.registerCommand(`vscode-neovim.${key}`, this.sendToVim.bind(this, vimKey)),
            );
        }
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-a-insert", this.ctrlAInsert));
        for (const reg of insertRegisterNames) {
            this.disposables.push(
                vscode.commands.registerCommand(
                    `vscode-neovim.paste-register-${reg}`,
                    this.copyFromRegister.bind(this, reg),
                ),
            );
        }
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
        await editor.edit(b => b.insert(editor.selection.active, lines.join("\n")));
    };

    private async copyFromRegister(registerName: string): Promise<void> {
        // copy content from register in insert mode
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const content = await this.client.callFunction("VSCodeGetRegister", [registerName]);
        if (content === "") {
            return;
        }
        await editor.edit(b => b.insert(editor.selection.active, content));
    }
}
