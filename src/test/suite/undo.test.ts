import vscode from "vscode";

import { attachTestNvimClient, sendVSCodeKeys, assertContent, wait, closeActiveEditor, sendEscapeKey } from "../utils";

describe("Undo", () => {
    vscode.window.showInformationMessage("Undo test");
    const client = attachTestNvimClient();

    it("U in new buffer doesnt undo initial content", async () => {
        await wait();
        const doc = await vscode.workspace.openTextDocument({
            content: "some line\notherline",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["some line", "otherline"],
            },
            client,
        );

        await closeActiveEditor(client);
    });

    it("Undo points are correct after the insert mode", async () => {
        await wait();
        const doc = await vscode.workspace.openTextDocument({
            content: "some line\notherline",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await sendVSCodeKeys("jjA");
        await sendVSCodeKeys("\nblah");
        await sendEscapeKey();

        await sendVSCodeKeys("A");
        await sendVSCodeKeys("\nblah");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["some line", "otherline", "blah", "blah"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["some line", "otherline", "blah"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["some line", "otherline"],
            },
            client,
        );

        await closeActiveEditor(client);
    });
});
