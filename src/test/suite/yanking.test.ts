// import vscode from "vscode";

// import { attachTestNvimClient, setSelection, sendVSCodeKeys, assertContent } from "../utils";

describe("Yanking and pasting", () => {
    /*vscode.window.showInformationMessage("Yank & paste test");
    const client = attachTestNvimClient();

    it("Yank and paste works", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "some line\notherline",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        setSelection([{ anchorPos: [1, 0], cursorPos: [1, 0] }]);

        await sendVSCodeKeys("yy");
        await sendVSCodeKeys("P");
        await assertContent(
            {
                content: ["some line", "otherline", "otherline"],
                cursor: [1, 0],
            },
            client,
        );
    });

    it("Works when pasting into new vscode file", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "some line\notherline",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await sendVSCodeKeys("yj");

        const doc2 = await vscode.workspace.openTextDocument({});
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.One);
        await sendVSCodeKeys("p");

        await assertContent(
            {
                content: ["", "some line", "otherline"],
                cursor: [1, 0],
            },
            client,
        );
    });*/
});
