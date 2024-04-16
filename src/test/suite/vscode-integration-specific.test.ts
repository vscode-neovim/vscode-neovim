import path from "path";
import os from "os";
import fs from "fs";
import { strict as assert } from "assert";

import vscode, { Selection } from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    assertContent,
    wait,
    setCursor,
    sendVSCodeKeys,
    closeAllActiveEditors,
    sendEscapeKey,
    closeNvimClient,
    getVScodeCursor,
    sendVSCodeKeysAtomic,
    openTextDocument,
    sendInsertKey,
    sendVSCodeCommand,
    sendNeovimKeys,
} from "../integrationUtils";

describe("VSCode integration specific stuff", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    beforeEach(async () => {
        await closeAllActiveEditors();
    });

    it("Doesnt move cursor on peek definition", async () => {
        const doc = (
            await openTextDocument({
                content: 'declare function test(a: number): void;\n\ntest("")\n',
                language: "typescript",
            })
        ).document;
        await setCursor(2, 1);

        // peek definition opens another editor. make sure the cursor won't be leaked into primary editor
        await vscode.commands.executeCommand("editor.action.peekDefinition", doc.uri, new vscode.Position(2, 1));
        await wait(500);
        await vscode.commands.executeCommand("closeReferenceSearch", doc.uri, new vscode.Position(2, 1));
        await wait(500);
        await assertContent(
            {
                cursor: [2, 1],
            },
            client,
        );
    });

    it("Moves on cursor on go definition", async () => {
        const doc = (
            await openTextDocument({
                content: 'declare function test(a: number): void;\n\ntest("")\n',
                language: "typescript",
            })
        ).document;
        await setCursor(2, 1);

        await vscode.commands.executeCommand("editor.action.goToTypeDefinition", doc.uri, new vscode.Position(2, 1));
        await wait(1000);
        await assertContent(
            {
                cursor: [0, 17],
            },
            client,
        );
    });

    // TODO: always fails on CI, possible something with screen dimensions?
    it.skip("Editor cursor revealing", async () => {
        await openTextDocument(path.join(__dirname, "../../../test_fixtures/cursor-revealing.txt"));

        await sendVSCodeKeys("90j");
        await assertContent({ cursor: [90, 0], vsCodeVisibleRange: { bottom: 90 } }, client);

        await sendVSCodeKeys("zt");
        await assertContent({ cursor: [90, 0], vsCodeVisibleRange: { top: 90 } }, client);

        // await sendVSCodeKeys("40k");
        // await assertContent({ cursor: [90, 0], vsCodeVisibleRange: { bottom: 50 } }, client);
    });

    it("Scrolling actions", async () => {
        const editor = await openTextDocument(path.join(__dirname, "../../../test_fixtures/scrolltest.txt"));

        await sendVSCodeCommand("vscode-neovim.ctrl-f");

        let visibleRange = editor.visibleRanges[0];
        assert.strictEqual(editor.selection.active.line, visibleRange.start.line);
        await assertContent(
            {
                cursor: [editor.visibleRanges[0].start.line, 0],
            },
            client,
        );

        await sendVSCodeKeys("L", 400);
        visibleRange = editor.visibleRanges[0];
        const cursor = getVScodeCursor(editor);
        assert.ok(cursor[0] <= visibleRange.end.line && cursor[0] >= visibleRange.end.line - 1);
        await assertContent(
            {
                cursor,
            },
            client,
        );

        await sendVSCodeKeys("M", 400);
        visibleRange = editor.visibleRanges[0];
        await assertContent(
            {
                cursor: [editor.selection.active.line, 0],
            },
            client,
        );
        const middleline = visibleRange.start.line + (visibleRange.end.line - visibleRange.start.line) / 2;
        assert.ok(editor.selection.active.line >= middleline - 1);
        assert.ok(editor.selection.active.line <= middleline + 1);

        await sendVSCodeKeys("H", 400);
        visibleRange = editor.visibleRanges[0];
        await assertContent(
            {
                cursor: [visibleRange.start.line, 0],
            },
            client,
        );
    });

    // todo: sometimes it's failing, but most times works
    it("Go to definition in other file - cursor is ok", async function () {
        this.retries(3);

        const doc2 = (await openTextDocument(path.join(__dirname, "../../../test_fixtures/b.ts"))).document;
        await setCursor(3, 1);

        await vscode.commands.executeCommand("editor.action.goToTypeDefinition", doc2.uri, new vscode.Position(2, 1));
        await wait(500);

        await assertContent(
            {
                cursor: [4, 16],
                content: [
                    'export const a = "blah";',
                    "",
                    'export const b = "blah";',
                    "",
                    "export function someFunc(): void;",
                    "",
                ],
            },
            client,
        );
    });

    it("Current mode is canceled when switching between editor panes", async () => {
        await openTextDocument({
            content: "blah1",
        });
        await wait(500);
        const doc2 = await vscode.workspace.openTextDocument({
            content: "blah2",
        });
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.Two);
        await wait(500);

        await client.command("au BufEnter * stopinsert");
        await wait(500);
        await sendVSCodeCommand("workbench.action.focusSecondEditorGroup", "", 1000);
        await sendInsertKey("I");
        await assertContent(
            {
                content: ["blah2"],
                cursorStyle: "line",
                mode: "i",
            },
            client,
        );
        // make sure the changes will be synced with neovim
        await sendVSCodeKeys("test", 1000);
        await sendVSCodeCommand("workbench.action.focusFirstEditorGroup", "", 2000);
        await assertContent(
            {
                content: ["blah1"],
                cursorStyle: "block",
                mode: "n",
            },
            client,
        );

        await sendVSCodeKeys("V");
        await assertContent(
            {
                content: ["blah1"],
                mode: "V",
            },
            client,
        );

        await sendVSCodeCommand("workbench.action.focusSecondEditorGroup", "", 2000);
        await assertContent(
            {
                content: ["testblah2"],
                mode: "n",
            },
            client,
        );
    });

    it("Current mode is canceled when switching between editor tabs", async () => {
        const doc1 = await vscode.workspace.openTextDocument({
            content: "blah1",
        });
        await vscode.window.showTextDocument(doc1, vscode.ViewColumn.One);
        const doc2 = await vscode.workspace.openTextDocument({
            content: "blah2",
        });
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.One);
        await wait(500);
        await client.command("au BufEnter * stopinsert");
        await wait(500);

        await sendInsertKey("I");
        await assertContent(
            {
                content: ["blah2"],
                cursorStyle: "line",
                mode: "i",
            },
            client,
        );
        // make sure the changes will be synced with neovim
        await sendVSCodeKeys("test", 500);
        await sendVSCodeCommand("workbench.action.previousEditorInGroup", "", 500);
        await assertContent(
            {
                content: ["blah1"],
                cursorStyle: "block",
                mode: "n",
            },
            client,
        );

        await sendVSCodeKeys("V");
        await assertContent(
            {
                content: ["blah1"],
                mode: "V",
            },
            client,
        );

        await sendVSCodeCommand("workbench.action.nextEditorInGroup", "", 500);
        await assertContent(
            {
                content: ["testblah2"],
                cursorStyle: "block",
                mode: "n",
            },
            client,
        );
    });

    it("Cursor is ok when go to def into editor in the other pane", async () => {
        const doc1 = await vscode.workspace.openTextDocument(path.join(__dirname, "../../../test_fixtures/bb.ts"));
        await vscode.window.showTextDocument(doc1, vscode.ViewColumn.One);
        await wait(1500);

        const doc2 = await vscode.workspace.openTextDocument(
            path.join(__dirname, "../../../test_fixtures/def-with-scroll.ts"),
        );
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.Two, true);
        await wait(1500);

        // make sure we're in first editor group
        await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup");
        await wait();

        await sendVSCodeKeys("gg5j", 0);
        await wait(1000);

        await vscode.commands.executeCommand(
            "editor.action.revealDefinitionAside",
            doc1.uri,
            new vscode.Position(5, 1),
        );
        await wait(1500);

        await assertContent(
            {
                cursor: [115, 16],
            },
            client,
        );
    });

    it("Cursor is ok for incsearch after scroll", async () => {
        const e = await openTextDocument(path.join(__dirname, "../../../test_fixtures/incsearch-scroll.ts"));

        await sendVSCodeKeys("gg");
        await wait(500);
        await sendVSCodeKeys("/bla");
        await wait(500);
        await assertContent({ cursor: [115, 19] }, client);
        assert.ok(e.visibleRanges[0].start.line <= 115);
    });

    // !Passes only when the runner is in foreground
    it("Cursor is preserved if same doc is opened in two editor columns", async () => {
        const doc = (
            await openTextDocument(path.join(__dirname, "../../../test_fixtures/cursor-preserved-between-columns.txt"))
        ).document;
        await wait(1000);
        await sendVSCodeKeys("gg050j", 1000);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two, false);
        await wait(1000);
        await sendVSCodeKeys("gg0100j", 1000);

        await sendVSCodeCommand("workbench.action.focusFirstEditorGroup", "", 2000);
        await sendVSCodeKeys("l");
        await assertContent(
            {
                cursor: [50, 1],
            },
            client,
        );

        await sendVSCodeCommand("workbench.action.focusSecondEditorGroup", "", 1000);
        await sendVSCodeKeys("l");
        await assertContent(
            {
                cursor: [100, 1],
            },
            client,
        );
    });

    it("Opens a file through e command", async () => {
        const filePath = path.join(os.tmpdir(), Math.random().toString());
        fs.writeFileSync(filePath, ["line 1"].join("\n"), {
            encoding: "utf8",
        });

        await openTextDocument({ content: "blah" });

        await sendVSCodeKeysAtomic(":e " + filePath, 500);
        await sendVSCodeCommand("vscode-neovim.commit-cmdline", "", 500);
        await assertContent(
            {
                content: ["line 1"],
            },
            client,
        );
    });

    it("Spawning command line from visual line mode produces vscode selection", async () => {
        await openTextDocument({ content: ["a1", "b1", "c1"].join("\n") });
        await sendVSCodeKeys("Vj");
        await sendVSCodeCommand("workbench.action.quickOpen");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 1, 2)],
            },
            client,
        );
        await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
        await sendEscapeKey();

        await sendVSCodeKeys("GVk");
        await sendVSCodeCommand("workbench.action.quickOpen");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(2, 2, 1, 0)],
            },
            client,
        );
        await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
    });

    it("Spawning command line from visual mode produces vscode selection", async () => {
        const documentContent = "Hello World!";
        await openTextDocument({ content: documentContent });
        await sendVSCodeKeys("v$");
        await sendVSCodeCommand("workbench.action.quickOpen");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 0, documentContent.length)],
            },
            client,
        );
        await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
        await sendEscapeKey();

        await sendVSCodeKeys("gvo");
        await sendVSCodeCommand("vscode-neovim.send", "<C-P>");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, documentContent.length, 0, 0)],
            },
            client,
        );
        await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
    });

    it("Filetype detection", async function () {
        this.retries(3);

        const doc1 = await vscode.workspace.openTextDocument(path.join(__dirname, "../../../test_fixtures/bb.ts"));
        await vscode.window.showTextDocument(doc1, vscode.ViewColumn.One);
        await wait(1500);

        const buf = await client.buffer;
        const type = await client.request("nvim_buf_get_option", [buf.id, "filetype"]);
        assert.strictEqual("typescript", type);
    });

    it("Filetype detection (jupyter notebook)", async function () {
        this.retries(2);

        const note = await vscode.workspace.openNotebookDocument(
            vscode.Uri.file(path.join(__dirname, "../../../test_fixtures/window-changed.ipynb")),
        );
        await vscode.window.showNotebookDocument(note, { viewColumn: vscode.ViewColumn.One });
        await wait(1000);

        const buf = await client.buffer;
        const type = await client.request("nvim_buf_get_option", [buf.id, "filetype"]);
        assert.strictEqual("python", type);
    });

    it("Next search result works", async () => {
        await openTextDocument(path.join(__dirname, "../../../test_fixtures/incsearch-scroll.ts"));

        await sendVSCodeCommand("workbench.action.findInFiles", { query: "blah" }, 500);
        await sendVSCodeCommand("search.action.refreshSearchResults");
        await sendVSCodeCommand("workbench.action.focusFirstEditorGroup");
        await sendVSCodeCommand("search.action.focusNextSearchResult");
        await assertContent(
            {
                vsCodeSelections: [new Selection(115, 16, 115, 20)],
                neovimCursor: [115, 19],
            },
            client,
        );

        await sendVSCodeCommand("search.action.focusNextSearchResult");
        await assertContent(
            {
                vsCodeSelections: [new Selection(170, 16, 170, 20)],
                neovimCursor: [170, 19],
            },
            client,
        );
    });

    it("Edit on long lines works", async () => {
        await openTextDocument(path.join(__dirname, "../../../test_fixtures/long-line.txt"));

        await sendVSCodeKeys("gg^");
        await sendVSCodeKeys("2jb");
        await assertContent(
            {
                cursor: [1, 1580],
            },
            client,
        );

        await sendVSCodeKeys("iabc");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [1, 1582],
            },
            client,
        );

        await sendVSCodeKeys("jhk");
        await assertContent(
            {
                cursor: [1, 10],
            },
            client,
        );

        await sendVSCodeKeys("Aabc");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [1, 1589],
            },
            client,
        );

        await sendVSCodeKeys("Iabc");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [1, 2],
            },
            client,
        );

        await sendVSCodeKeys("$");
        await assertContent(
            {
                cursor: [1, 1592],
            },
            client,
        );
    });

    it("cursorMove with wrappedLine should works #1498", async () => {
        await openTextDocument({ content: "  hello\n\nworld" });
        await wait(200);
        await sendNeovimKeys(client, "ll", 200);
        vscode.commands.executeCommand("cursorMove", { to: "down", by: "wrappedLine" });
        await wait(200);
        vscode.commands.executeCommand("cursorMove", { to: "down", by: "wrappedLine" });
        await wait(200);
        await assertContent({ cursor: [2, 2] }, client);
    });

    it("vim.ui.select works", async () => {
        await client.lua(`
            vim.ui.select({ 'red', 'green', 'blue' }, {}, function(item, idx)
                vim.g._ret_item = item
                vim.g._ret_idx = idx
            end)
        `);
        // wait enough time for it to open
        await wait(100);
        // select the last item
        await vscode.commands.executeCommand("workbench.action.quickOpenNavigateNext");
        await vscode.commands.executeCommand("workbench.action.quickOpenNavigateNext");
        await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
        // check the results
        const actual_item = await client.getVar("_ret_item");
        const actual_idx = await client.getVar("_ret_idx");
        assert.strictEqual(actual_item, "blue");
        assert.strictEqual(actual_idx, 3);
    });

    it("vim.ui.select with format_item works", async () => {
        await client.lua(`
            vim.ui.select({{ label = 'apple', detail = 'red' }, { label = 'avocado', detail = 'green' }}, {
                format_item = function(item)
                    return item.label
                end
            }, function(item, idx)
                vim.g._ret_item = item
                vim.g._ret_idx = idx
            end)
        `);
        // wait enough time for it to open
        await wait(100);
        // select the first item
        await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
        // check the results
        const actual_item = (await client.getVar("_ret_item")) as { label: string; detail: string };
        const actual_idx = await client.getVar("_ret_idx");
        assert.ok(typeof actual_item === "object");
        assert.strictEqual(actual_item.label, "apple");
        assert.strictEqual(actual_item.detail, "red");
        assert.strictEqual(actual_idx, 1);
    });

    it("vim.ui.select cancel returns nil", async () => {
        await client.lua(`
            vim.ui.select({ 'red', 'green', 'blue' }, {}, function(item, idx)
                vim.g._ret_item = item
                vim.g._ret_idx = idx
            end)
        `);
        // wait enough time for it to open
        await wait(100);
        // cancel the dialog
        await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
        // check the results
        const actual_item = await client.getVar("_ret_item");
        const actual_idx = await client.getVar("_ret_idx");
        assert.strictEqual(actual_item, null);
        assert.strictEqual(actual_idx, null);
    });

    it("vim.ui.input works", async () => {
        await client.lua(`
            vim.ui.input({ prompt = 'Enter a value: ', default = 'test' }, function(input)
                vim.g._res = input
            end)
        `);
        // wait enough time for it to open
        await wait(100);
        // confirm the value
        await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
        // check the results
        const actual_input = await client.getVar("_res");
        assert.strictEqual(actual_input, "test");
    });

    it("vim.ui.input empty not nil", async () => {
        await client.lua(`
            vim.ui.input({ prompt = 'Enter a value: ' }, function(input)
                vim.g._res = input
            end)
        `);
        // wait enough time for it to open
        await wait(100);
        // confirm the value
        await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
        // check the results
        const actual_input = await client.getVar("_res");
        assert.strictEqual(actual_input, "");
    });

    it("vim.ui.input cancel returns nil", async () => {
        await client.lua(`
            vim.ui.input({ prompt = 'Enter a value: ' }, function(input)
                vim.g._res = input
            end)
        `);
        // wait enough time for it to open
        await wait(100);
        // cancel the dialog
        await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
        // check the results
        const actual_input = await client.getVar("_res");
        assert.strictEqual(actual_input, null);
    });
});
