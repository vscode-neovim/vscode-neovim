import path from "path";
import os from "os";
import fs from "fs";
import { strict as assert } from "assert";

import vscode from "vscode";
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
} from "../utils";

describe("VSCode integration specific stuff", () => {
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

    it("Doesnt move cursor on peek definition", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'declare function test(a: number): void;\n\ntest("")\n',
            language: "typescript",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);
        await setCursor(2, 1, 1000);

        // peek definition opens another editor. make sure the cursor won't be leaked into primary editor
        await vscode.commands.executeCommand("editor.action.peekDefinition", doc.uri, new vscode.Position(2, 1));
        await wait();

        await assertContent(
            {
                cursor: [2, 1],
            },
            client,
        );
    });

    it("Moves on cursor on go definition", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'declare function test(a: number): void;\n\ntest("")\n',
            language: "typescript",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await setCursor(2, 1);
        await wait(1000);

        await vscode.commands.executeCommand("editor.action.goToTypeDefinition", doc.uri, new vscode.Position(2, 1));
        await wait(2000);

        await assertContent(
            {
                cursor: [0, 17],
            },
            client,
        );
    });

    // TODO: always fails on CI, possible something with screen dimensions?
    it.skip("Editor cursor revealing", async () => {
        const doc = await vscode.workspace.openTextDocument(
            path.join(__dirname, "../../../test_fixtures/cursor-revealing.txt"),
        );
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("90j", 0);
        await wait(2000);
        await assertContent({ cursor: [90, 0], vsCodeVisibleRange: { bottom: 90 } }, client);

        await sendVSCodeKeys("zt", 0);
        await wait(2000);
        await assertContent({ cursor: [90, 0], vsCodeVisibleRange: { top: 90 } }, client);

        // await sendVSCodeKeys("40k", 1000);
        // await assertContent({ cursor: [90, 0], vsCodeVisibleRange: { bottom: 50 } }, client);
    });

    it("Scrolling actions", async () => {
        const doc = await vscode.workspace.openTextDocument(
            path.join(__dirname, "../../../test_fixtures/scrolltest.txt"),
        );
        const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);
        await vscode.commands.executeCommand("vscode-neovim.ctrl-f");
        await wait(1500);

        let visibleRange = editor.visibleRanges[0];
        assert.strictEqual(editor.selection.active.line, visibleRange.start.line);
        await assertContent(
            {
                cursor: [editor.visibleRanges[0].start.line, 0],
            },
            client,
        );

        await sendVSCodeKeys("L", 1500);
        visibleRange = editor.visibleRanges[0];
        const cursor = getVScodeCursor(editor);
        assert.ok(cursor[0] <= visibleRange.end.line && cursor[0] >= visibleRange.end.line - 1);
        await assertContent(
            {
                cursor,
            },
            client,
        );

        await sendVSCodeKeys("M", 1500);
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

        await sendVSCodeKeys("H", 1500);
        visibleRange = editor.visibleRanges[0];
        await assertContent(
            {
                cursor: [visibleRange.start.line, 0],
            },
            client,
        );
    });

    // todo: sometimes it's failing, but most times works
    it("Go to definition in other file - cursor is ok", async () => {
        const doc2 = await vscode.workspace.openTextDocument(path.join(__dirname, "../../../test_fixtures/b.ts"));
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.One);
        await wait();

        await setCursor(3, 1);

        await vscode.commands.executeCommand("editor.action.goToTypeDefinition", doc2.uri, new vscode.Position(2, 1));
        await wait(3000);

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
        const doc1 = await vscode.workspace.openTextDocument({
            content: "blah1",
        });
        await vscode.window.showTextDocument(doc1, vscode.ViewColumn.One);
        await wait();
        const doc2 = await vscode.workspace.openTextDocument({
            content: "blah2",
        });
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.Two);
        await wait();

        await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");
        await wait();

        await sendVSCodeKeys("i");
        await assertContent(
            {
                content: ["blah2"],
                cursorStyle: "line",
                mode: "i",
            },
            client,
        );
        // make sure the changes will be synced with neovim
        await sendVSCodeKeys("test");

        await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup");
        await wait();

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
                cursorStyle: "block",
                mode: "V",
            },
            client,
        );

        await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");
        await wait();
        await assertContent(
            {
                content: ["testblah2"],
                cursorStyle: "block",
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
        await wait();
        const doc2 = await vscode.workspace.openTextDocument({
            content: "blah2",
        });
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("i");
        await assertContent(
            {
                content: ["blah2"],
                cursorStyle: "line",
                mode: "i",
            },
            client,
        );
        // make sure the changes will be synced with neovim
        await sendVSCodeKeys("test");

        await vscode.commands.executeCommand("workbench.action.previousEditorInGroup");
        await wait();

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
                cursorStyle: "block",
                mode: "V",
            },
            client,
        );

        await vscode.commands.executeCommand("workbench.action.nextEditorInGroup");
        await wait();
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
        const doc = await vscode.workspace.openTextDocument(
            path.join(__dirname, "../../../test_fixtures/incsearch-scroll.ts"),
        );
        const e = await vscode.window.showTextDocument(doc);
        await wait(1000);

        await sendVSCodeKeys("gg");
        await sendVSCodeKeys("/bla", 1000);

        await assertContent({ cursor: [115, 19] }, client);
        assert.ok(e.visibleRanges[0].start.line < 115);
    });

    // !Passes only when the runner is in foreground
    it("Cursor is preserved if same doc is opened in two editor columns", async () => {
        const doc = await vscode.workspace.openTextDocument(
            path.join(__dirname, "../../../test_fixtures/cursor-preserved-between-columns.txt"),
        );
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);
        await sendVSCodeKeys("gg50j", 0);
        await wait(1500);
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Two, false);
        await wait(1000);
        await sendVSCodeKeys("gg100j", 0);
        await wait(1500);

        await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup");
        await wait(2000);
        await sendVSCodeKeys("l");
        await assertContent(
            {
                cursor: [50, 1],
            },
            client,
        );

        await vscode.commands.executeCommand("workbench.action.focusSecondEditorGroup");
        await wait(2000);
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

        const doc = await vscode.workspace.openTextDocument({ content: "blah" });
        await vscode.window.showTextDocument(doc);
        await wait(1000);

        await sendVSCodeKeysAtomic(":e " + filePath);
        await wait(1000);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        await wait(1000);

        await assertContent(
            {
                content: ["line 1"],
            },
            client,
        );
    });

    it("Spawning command line from visual mode produces vscode selection", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["a1", "b1", "c1"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait(1000);
        await sendVSCodeKeys("Vj");
        await vscode.commands.executeCommand("vscode-neovim.send", "<C-P>");
        await wait();
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 1, 2)],
            },
            client,
        );
        await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
        await sendEscapeKey();

        await sendVSCodeKeys("GVk");
        await vscode.commands.executeCommand("vscode-neovim.send", "<C-P>");
        await wait();
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(2, 2, 1, 0)],
            },
            client,
        );
        await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
    });

    it("Filetype detection", async () => {
        const doc1 = await vscode.workspace.openTextDocument(path.join(__dirname, "../../../test_fixtures/bb.ts"));
        await vscode.window.showTextDocument(doc1, vscode.ViewColumn.One);
        await wait(1500);

        const buf = await client.buffer;
        const type = await client.request("nvim_buf_get_option", [buf.id, "filetype"]);
        assert.strictEqual("typescript", type);
    });

    it("Next search result works", async () => {
        const doc = await vscode.workspace.openTextDocument(
            path.join(__dirname, "../../../test_fixtures/incsearch-scroll.ts"),
        );
        await vscode.window.showTextDocument(doc);
        await wait();
        await sendVSCodeKeys("gg");

        await vscode.commands.executeCommand("workbench.action.findInFiles", { query: "blah" });
        await wait(2000);

        await vscode.commands.executeCommand("workbench.action.focusFirstEditorGroup");
        await wait();

        await vscode.commands.executeCommand("search.action.focusNextSearchResult");
        await wait();

        await assertContent(
            {
                cursor: [115, 20],
            },
            client,
        );

        await vscode.commands.executeCommand("search.action.focusNextSearchResult");
        await wait();
        await assertContent(
            {
                cursor: [170, 20],
            },
            client,
        );
    });
});
