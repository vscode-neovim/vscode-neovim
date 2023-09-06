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
        await client.command("autocmd InsertEnter * set nornu");
        await client.command("autocmd InsertLeave * set rnu");
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
        await wait();

        await setCursor(3, 0);
        await wait();

        await sendVSCodeKeys("i");
        await wait();
        assert.equal(editor.options.lineNumbers, vscode.TextEditorLineNumbersStyle.On);

        await sendEscapeKey();
        await wait();
        assert.equal(editor.options.lineNumbers, vscode.TextEditorLineNumbersStyle.Relative);
    });
});
