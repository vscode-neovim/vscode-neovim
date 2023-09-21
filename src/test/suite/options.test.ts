import { strict as assert } from "assert";

import { NeovimClient } from "neovim";
import vscode from "vscode";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendEscapeKey,
    sendVSCodeKeys,
    setCursor,
    wait,
} from "../utils";

describe("Sync options test", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
        await client.command("augroup TestOptions");
        await client.command("autocmd InsertEnter * set nu nornu");
        await client.command("autocmd InsertLeave * set nu rnu");
        await client.command("augroup END");
    });
    after(async () => {
        await client.command("augroup TestOptions");
        await client.command("autocmd!");
        await client.command("augroup END");
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("number & relativenumber", async () => {
        const editor = await openTextDocument({ content: "testing...\n".repeat(10) });
        await wait(200);

        await setCursor(3, 0);
        await wait(200);

        await client.command("set nu");
        await wait(200);
        assert.equal(editor.options.lineNumbers, vscode.TextEditorLineNumbersStyle.On);

        await client.command("set rnu");
        await wait(200);
        assert.equal(editor.options.lineNumbers, vscode.TextEditorLineNumbersStyle.Relative);

        await client.command("set nornu");
        await wait(200);
        assert.equal(editor.options.lineNumbers, vscode.TextEditorLineNumbersStyle.On);

        await client.command("set nonu");
        await wait(200);
        assert.equal(editor.options.lineNumbers, vscode.TextEditorLineNumbersStyle.Off);

        await sendVSCodeKeys("i");
        await wait(200);
        assert.equal(editor.options.lineNumbers, vscode.TextEditorLineNumbersStyle.On);

        await sendEscapeKey();
        await wait(200);
        assert.equal(editor.options.lineNumbers, vscode.TextEditorLineNumbersStyle.Relative);
    });
});
