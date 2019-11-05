import path from "path";
import { strict as assert } from "assert";

import vscode from "vscode";

import {
    attachTestNvimClient,
    assertContent,
    wait,
    setCursor,
    closeActiveEditor,
    sendVSCodeKeys,
    closeAllActiveEditors,
} from "../utils";

describe("VSCode integration specific stuff", () => {
    const client = attachTestNvimClient();

    it("Doesnt move cursor on peek definition", async () => {
        await wait();
        const doc = await vscode.workspace.openTextDocument({
            content: 'declare function test(a: number): void;\n\ntest("")\n',
            language: "typescript",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await setCursor(2, 1);

        // peek definition opens another editor. make sure the cursor won't be leaked into primary editor
        await vscode.commands.executeCommand("editor.action.peekDefinition", doc.uri, new vscode.Position(2, 1));

        await assertContent(
            {
                cursor: [2, 1],
            },
            client,
        );
        await closeActiveEditor(client);
    });

    it("Moves on cursor on go definition", async () => {
        await wait();
        const doc = await vscode.workspace.openTextDocument({
            content: 'declare function test(a: number): void;\n\ntest("")\n',
            language: "typescript",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await setCursor(2, 1);

        await vscode.commands.executeCommand("editor.action.goToTypeDefinition", doc.uri, new vscode.Position(2, 1));

        await assertContent(
            {
                cursor: [0, 17],
            },
            client,
        );
        await closeActiveEditor(client);
    });

    it("Editor cursor revealing", async () => {
        await wait();
        const doc = await vscode.workspace.openTextDocument(
            path.join(__dirname, "../../../test_fixtures/scrolltest.txt"),
        );
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("130j");
        await assertContent({ cursor: [130, 0] }, client);

        let range = vscode.window.activeTextEditor!.visibleRanges[0];
        assert.ok(range.start.line <= 129);

        await sendVSCodeKeys("40k");
        range = vscode.window.activeTextEditor!.visibleRanges[0];
        assert.ok(range.start.line <= 89);

        await closeActiveEditor(client);
    });

    it("Go to definition in other file - cursor is ok", async () => {
        await wait();

        const doc2 = await vscode.workspace.openTextDocument(path.join(__dirname, "../../../test_fixtures/b.ts"));
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.One);
        await wait();

        await setCursor(2, 1);

        // peek definition opens another editor. make sure the cursor won't be leaked into primary editor
        await vscode.commands.executeCommand("editor.action.goToTypeDefinition", doc2.uri, new vscode.Position(2, 1));
        await wait(1500);

        await assertContent(
            {
                cursor: [4, 16],
                content: [
                    'export const a = "blah";',
                    "",
                    'export const b = "blah";',
                    "",
                    "export function someFunc(): void;",
                    "",
                ],
            },
            client,
        );
        await closeAllActiveEditors(client);
    });
});
