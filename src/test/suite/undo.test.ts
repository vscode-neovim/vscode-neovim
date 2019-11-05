import vscode from "vscode";

import { attachTestNvimClient, sendVSCodeKeys, assertContent, wait, closeActiveEditor } from "../utils";

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
});
