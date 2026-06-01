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
    waitForCondition,
} from "./integrationUtils";

describe("Synchronize editor options", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
        await client.command("setglobal modeline");
        await client.command("augroup TestOptions");
        // number
        await client.command("autocmd InsertEnter * setlocal number");
        await client.command("autocmd InsertEnter * setlocal norelativenumber");
        await client.command("autocmd InsertLeave * setlocal number");
        await client.command("autocmd InsertLeave * setlocal relativenumber");
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

    afterEach(async () => {
        await client.command("setlocal norelativenumber");
        await client.command("setlocal nonumber");
        await closeAllActiveEditors();
    });

    async function assertLineNumbers(
        editor: vscode.TextEditor,
        expected: vscode.TextEditorLineNumbersStyle,
        label: string,
    ): Promise<void> {
        const expectedNvimStyle =
            expected === vscode.TextEditorLineNumbersStyle.Off
                ? "off"
                : expected === vscode.TextEditorLineNumbersStyle.On
                  ? "on"
                  : "relative";
        const getNvimStyle = async () =>
            client.lua(`
                return vim.wo.rnu and 'relative' or vim.wo.nu and 'on' or 'off'
            `);

        await waitForCondition(
            async () => {
                await client.command("doautocmd CursorMoved");
                assert.equal(await getNvimStyle(), expectedNvimStyle, `${label} in nvim`);
                assert.equal(editor.options.lineNumbers, expected, label);
                await wait(100);
                assert.equal(await getNvimStyle(), expectedNvimStyle, `${label} in nvim after editor option echo`);
                assert.equal(editor.options.lineNumbers, expected, `${label} after editor option echo`);
                return true;
            },
            {
                timeout: 3000,
                message: `Expected lineNumbers to be ${expected} after ${label}`,
            },
        );
    }

    it("number & relativenumber", async () => {
        const editor = await openTextDocument({ content: "testing...\n".repeat(10) });
        await client.command("setlocal norelativenumber");
        await client.command("setlocal nonumber");
        await assertLineNumbers(editor, vscode.TextEditorLineNumbersStyle.Off, "reset");

        await setCursor(3, 0);

        await client.command("setlocal number");
        await client.command("setlocal norelativenumber");
        await assertLineNumbers(editor, vscode.TextEditorLineNumbersStyle.On, "set nu nornu");

        await client.command("setlocal number");
        await client.command("setlocal relativenumber");
        await assertLineNumbers(editor, vscode.TextEditorLineNumbersStyle.Relative, "set nu rnu");

        await client.command("setlocal norelativenumber");
        await assertLineNumbers(editor, vscode.TextEditorLineNumbersStyle.On, "set nornu");

        await client.command("setlocal norelativenumber");
        await client.command("setlocal nonumber");
        await assertLineNumbers(editor, vscode.TextEditorLineNumbersStyle.Off, "set nonu nornu");

        await sendVSCodeKeys("i");
        await assertLineNumbers(editor, vscode.TextEditorLineNumbersStyle.On, "InsertEnter");

        await sendEscapeKey();
        await assertLineNumbers(editor, vscode.TextEditorLineNumbersStyle.Relative, "InsertLeave");
    });

    async function checkTab(editor: vscode.TextEditor): Promise<void> {
        const { insertSpaces, tabSize } = editor.options;
        const [expandtab, tabstop] = (await client.lua(`
            local expandtab = vim.api.nvim_get_option_value('expandtab', { buf = 0 })
            local tabstop = vim.api.nvim_get_option_value('tabstop', { buf = 0 })
            return { expandtab, tabstop }
        `)) as any[];
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
