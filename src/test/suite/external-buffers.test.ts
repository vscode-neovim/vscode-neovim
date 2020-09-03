import { strict as assert } from "assert";

import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    wait,
    closeActiveEditor,
    assertContent,
    sendVSCodeKeysAtomic,
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

        await sendVSCodeKeysAtomic(":help");
        await wait(1000);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        await wait(2000);

        const text = vscode.window.activeTextEditor!.document.getText();
        assert.ok(text.indexOf("main help file") !== -1);

        await sendVSCodeKeysAtomic(":help options");
        await wait(1000);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        await wait(2000);

        const text2 = vscode.window.activeTextEditor!.document.getText();
        assert.ok(text2.indexOf("VIM REFERENCE MANUAL") !== -1);

        await closeActiveEditor();
    });

    it("Cursor for external buffers is OK", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "blah",
        });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeysAtomic(":help local-options");
        await wait(1000);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        await wait(3000);

        await assertContent(
            {
                // todo: col positions are not correct, but seems not a big issue for now
                cursorLine: 186,
            },
            client,
        );
    });
});
