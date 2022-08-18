import vscode, { Disposable } from "vscode";
import { NeovimClient } from "neovim";

import { NeovimExtensionRequestProcessable } from "./neovim_events_processable";

export class CommandsController implements Disposable, NeovimExtensionRequestProcessable {
    private disposables: Disposable[] = [];

    public constructor(private client: NeovimClient) {
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-e", () => this.scrollLine("down")));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-y", () => this.scrollLine("up")));
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    public async handleExtensionRequest(name: string, args: unknown[]): Promise<void> {
        switch (name) {
            case "reveal": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const [at, updateCursor] = args as any;
                this.revealLine(at, !!updateCursor);
                break;
            }
        }
    }

    /// SCROLL COMMANDS ///
    private scrollLine = (to: "up" | "down"): void => {
        vscode.commands.executeCommand("editorScroll", { to, by: "line", revealCursor: true });
    };

    // zz, zt, zb and others
    private revealLine = (at: "center" | "top" | "bottom", resetCursor = false): void => {
        const e = vscode.window.activeTextEditor;
        if (!e) {
            return;
        }
        const cursor = e.selection.active;
        vscode.commands.executeCommand("revealLine", { lineNumber: cursor.line, at });
        // z<CR>/z./z-
        if (resetCursor) {
            const line = e.document.lineAt(cursor.line);
            e.selections = [
                new vscode.Selection(
                    cursor.line,
                    line.firstNonWhitespaceCharacterIndex,
                    cursor.line,
                    line.firstNonWhitespaceCharacterIndex,
                ),
            ];
        }
    };
}
