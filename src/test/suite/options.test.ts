import { strict as assert } from "assert";
import path from "path";

import { NeovimClient } from "neovim";
import vscode from "vscode";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendEscapeKey,
    sendNeovimKeys,
    sendVSCodeKeys,
    setCursor,
    wait,
} from "../integrationUtils";

describe("Synchronize editor options", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
        await client.command("setglobal modeline");
        await client.command("augroup TestOptions");
        // number
        await client.command("autocmd InsertEnter * set nu nornu");
        await client.command("autocmd InsertLeave * set nu rnu");
        // tab
        await client.command("autocmd FileType * setlocal noexpandtab tabstop=100");
        await client.command("augroup END");
    });
    after(async () => {
        await client.command("setglobal nomodeline");
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
        await wait(400);
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

    async function checkTab(editor: vscode.TextEditor): Promise<void> {
        const { insertSpaces, tabSize } = editor.options;
        const [[expandtab, tabstop]] = await client.callAtomic([
            ["nvim_buf_get_option", [0, "expandtab"]],
            ["nvim_buf_get_option", [0, "tabstop"]],
        ]);
        assert.equal(insertSpaces, expandtab, "insertSpaces should be equal to expandtab");
        assert.equal(tabSize, tabstop, "tabSize should be equal to tabstop");
    }

    it("should sync editor options for new buffer", async () => {
        let editor;

        editor = await openTextDocument({ content: "testing..." });
        await wait(200);
        await checkTab(editor);

        await wait(200);

        editor = await openTextDocument(path.join(__dirname, "../../../test_fixtures/a.ts"));
        await wait(200);
        await checkTab(editor);
    });

    it("should resync options when editor options changed", async () => {
        const editor = await openTextDocument({ content: "test" });
        await wait(200);

        editor.options.insertSpaces = !editor.options.insertSpaces;
        await wait(200);
        await checkTab(editor);

        await wait(200);

        editor.options.tabSize = (editor.options.tabSize as number) * 2;
        await wait(200);
        await checkTab(editor);
    });

    it("modeline should works", async () => {
        const editor = await openTextDocument({ content: "\nvim: set ts=11:" });
        await wait(200);
        await sendNeovimKeys(client, "hjkl");
        assert.equal(editor.options.tabSize, 11);

        const editor2 = await openTextDocument({ content: "vim: set noet ts=13:" });
        await wait(200);
        await sendNeovimKeys(client, "hjkl");
        assert.equal(editor2.options.tabSize, 13);
        assert.equal(editor2.options.insertSpaces, false);
    });
});
