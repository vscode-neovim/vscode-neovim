import { strict as assert } from "assert";

import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    wait,
    sendVSCodeKeys,
    closeActiveEditor,
} from "../utils";

describe("Neovim external buffers", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
    });

    afterEach(async () => {
        await closeAllActiveEditors();
    });

    it("Opens VIM help", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "blah",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys(":help");
        await sendVSCodeKeys("<CR>", 2000);

        assert.equal(vscode.workspace.textDocuments.length, 2);
        const text = vscode.window.activeTextEditor!.document.getText();
        assert.ok(text.indexOf("main help file") !== -1);

        await sendVSCodeKeys(":help options");
        await sendVSCodeKeys("<CR>", 2000);

        assert.equal(vscode.workspace.textDocuments.length, 3);
        const text2 = vscode.window.activeTextEditor!.document.getText();
        assert.ok(text2.indexOf("VIM REFERENCE MANUAL") !== -1);

        await closeActiveEditor();
        assert.equal(vscode.workspace.textDocuments.length, 2);
    });
});
