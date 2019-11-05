import vscode from "vscode";
import { NeovimClient } from "neovim";

import { attachTestNvimClient, sendVSCodeKeys, assertContent, wait, closeAllActiveEditors, setCursor } from "../utils";

describe("Yanking and pasting", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        client.quit();
    });

    afterEach(async () => {
        await closeAllActiveEditors();
    });

    it("Yank and paste works", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "some line\notherline",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await setCursor(1, 1);

        await sendVSCodeKeys("yy");
        await sendVSCodeKeys("p");
        await assertContent(
            {
                content: ["some line", "otherline", "otherline"],
                cursor: [2, 0],
            },
            client,
        );

        await setCursor(1, 1);
        await sendVSCodeKeys("P");
        await assertContent(
            {
                content: ["some line", "otherline", "otherline", "otherline"],
                cursor: [1, 0],
            },
            client,
        );
    });

    it("Pasting into document with single line", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "some line\notherline",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await sendVSCodeKeys("yj");

        const doc2 = await vscode.workspace.openTextDocument({});
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.One);
        await wait();
        await sendVSCodeKeys("p");

        await assertContent(
            {
                content: ["", "some line", "otherline"],
                cursor: [1, 0],
            },
            client,
        );

        const doc3 = await vscode.workspace.openTextDocument({ content: "blah" });
        await vscode.window.showTextDocument(doc3, vscode.ViewColumn.One);
        await wait();
        await sendVSCodeKeys("p");
        await assertContent(
            {
                content: ["blah", "some line", "otherline"],
                cursor: [1, 0],
            },
            client,
        );
    });
});
