import { strict as assert } from "assert";
import { NeovimClient } from "neovim";
import path from "path";
import vscode from "vscode";

import { attachTestNvimClient, closeAllActiveEditors, closeNvimClient, openTextDocument, wait } from "../utils";

describe("Tab options test", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
        await client.command("augroup TestTabstop");
        await client.command("autocmd FileType * setlocal noexpandtab tabstop=100");
        await client.command("augroup END");
    });
    after(async () => {
        await client.command("augroup TestTabstop");
        await client.command("autocmd!");
        await client.command("augroup END");
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    async function getTabOptions(): Promise<{ expandtab: boolean; tabstop: number }> {
        const [[expandtab, tabstop]] = await client.callAtomic([
            ["nvim_buf_get_option", [0, "expandtab"]],
            ["nvim_buf_get_option", [0, "tabstop"]],
        ]);
        return { expandtab, tabstop };
    }

    async function checkEditor(editor: vscode.TextEditor) {
        await wait(300);
        const { insertSpaces, tabSize } = editor.options;
        const { expandtab, tabstop } = await getTabOptions();
        assert.equal(insertSpaces, expandtab, "insertSpaces should be equal to expandtab");
        assert.equal(tabSize, tabstop, "tabSize should be equal to tabstop");
    }

    it("should sync editor options for new buffer", async () => {
        const editor = await openTextDocument(path.join(__dirname, "../../../test_fixtures/a.ts"));
        await checkEditor(editor);
    });

    it("should resync options when editor options changed", async () => {
        const editor = await openTextDocument({ content: "test" });
        await checkEditor(editor);

        editor.options.insertSpaces = !editor.options.insertSpaces;
        await checkEditor(editor);

        editor.options.tabSize = (editor.options.tabSize as number) * 2;
        await checkEditor(editor);
    });
});
