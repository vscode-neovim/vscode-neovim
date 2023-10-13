import vscode, { Disposable, commands } from "vscode";

import { config } from "./config";
import { eventBus } from "./eventBus";
import { MainController } from "./main_controller";

export class CommandsController implements Disposable {
    private disposables: Disposable[] = [];

    private get client() {
        return this.main.client;
    }

    public constructor(private main: MainController) {
        this.disposables.push(
            commands.registerCommand("vscode-neovim.ctrl-f", () => this.scrollPage("page", "down")),
            commands.registerCommand("vscode-neovim.ctrl-b", () => this.scrollPage("page", "up")),
            commands.registerCommand("vscode-neovim.ctrl-d", () => this.scrollPage("halfPage", "down")),
            commands.registerCommand("vscode-neovim.ctrl-u", () => this.scrollPage("halfPage", "up")),
            commands.registerCommand("vscode-neovim.ctrl-e", () => this.scrollLine("down")),
            commands.registerCommand("vscode-neovim.ctrl-y", () => this.scrollLine("up")),
            eventBus.on("reveal", ([at, updateCursor]) => this.revealLine(at, !!updateCursor)),
            eventBus.on("move-cursor", ([to]) => this.goToLine(to)),
            eventBus.on("scroll", ([by, to]) => this.scrollPage(by, to)),
            eventBus.on("scroll-line", ([to]) => this.scrollLine(to)),
            eventBus.on("insert-line", async ([type]) => {
                await this.client.command("startinsert");
                await commands.executeCommand(
                    type === "before" ? "editor.action.insertLineBefore" : "editor.action.insertLineAfter",
                );
            }),
        );
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    /// SCROLL COMMANDS ///
    private scrollPage = (by: "page" | "halfPage", to: "up" | "down"): void => {
        vscode.commands.executeCommand("editorScroll", { to, by, revealCursor: true });
    };

    private scrollLine = (to: "up" | "down"): void => {
        vscode.commands.executeCommand("editorScroll", { to, by: "line", revealCursor: config.revealCursorScrollLine });
    };

    private goToLine = (to: "top" | "middle" | "bottom"): void => {
        const e = vscode.window.activeTextEditor;
        if (!e) {
            return;
        }
        const topVisible = e.visibleRanges[0].start.line;
        const bottomVisible = e.visibleRanges[0].end.line;
        const lineNum =
            to === "top"
                ? topVisible
                : to === "bottom"
                ? bottomVisible
                : Math.floor(topVisible + (bottomVisible - topVisible) / 2);
        const line = e.document.lineAt(lineNum);
        e.selections = [
            new vscode.Selection(
                lineNum,
                line.firstNonWhitespaceCharacterIndex,
                lineNum,
                line.firstNonWhitespaceCharacterIndex,
            ),
        ];
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
