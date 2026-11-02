import { strict as assert } from "assert";
import fs from "fs";
import os from "os";
import path from "path";

import { NeovimClient } from "neovim";
import { Position, TextDocument, TextEditor, ViewColumn, WorkspaceEdit, window, workspace } from "vscode";

import { wait, waitUntil } from "../../utils";

import { attachTestNvimClient, closeAllActiveEditors, closeNvimClient } from "./integrationUtils";

/**
 * VSCode edits a document while the extension is still setting up its Nvim buffer
 * (BufferManager.initBufferForDocument -> DocumentChangeManager.onBufferInit).
 *
 * The init window is a few milliseconds wide, so the test widens it: a one-shot BufFilePost
 * autocmd blocks Nvim for BLOCK_MS inside the `init_document_buffer` request, after the extension
 * has taken its snapshot of the document. The edits are made while Nvim is blocked, and no edit
 * is made afterwards, so nothing but the init path can bring them to Nvim.
 */
const BLOCK_MS = 1500;

/** Arms the blocking hook for the buffer whose b:vscode_uri is `uri`; returns the sentinel path. */
async function armInitBlocker(client: NeovimClient, uri: string): Promise<string> {
    const sentinel = path.join(os.tmpdir(), `vscode-neovim-init-race-${process.pid}-${Math.random()}`);
    await client.lua(
        `
        local uri, sentinel, ms = ...
        local id
        id = vim.api.nvim_create_autocmd("BufFilePost", {
            callback = function(args)
                if vim.b[args.buf].vscode_uri ~= uri then return end
                pcall(vim.api.nvim_del_autocmd, id)
                vim.fn.writefile({}, sentinel)
                local start = vim.uv.hrtime()
                while vim.uv.hrtime() - start < ms * 1e6 do end
            end,
        })
        `,
        [uri, sentinel, BLOCK_MS],
    );
    return sentinel;
}

/** Shows `doc` and resolves once Nvim is blocked inside its buffer init. */
async function showAndWaitForBlockedInit(client: NeovimClient, doc: TextDocument): Promise<TextEditor> {
    const sentinel = await armInitBlocker(client, doc.uri.toString());
    const editor = await window.showTextDocument(doc, ViewColumn.One);
    await waitUntil(() => assert.ok(fs.existsSync(sentinel), "Nvim never reached buffer init"), 5000, 5);
    fs.unlinkSync(sentinel);
    return editor;
}

/**
 * Asserts Nvim is still blocked in the init hook, so the extension has not finished init for the
 * document and the edits made so far were queued. (Debug logs are not recorded at the default log
 * level, so the extension's "Init buffer content" line cannot serve as the witness.)
 */
async function assertInitNotDone(client: NeovimClient): Promise<void> {
    const start = Date.now();
    await client.eval("1");
    const latency = Date.now() - start;
    assert.ok(latency > 200, `Nvim answered in ${latency} ms: init was over before the edits, the race was missed`);
}

async function getNvimState(
    client: NeovimClient,
    doc: TextDocument,
): Promise<{ lines: string[]; modified: boolean } | null> {
    return (await client.lua(
        `
        local uri = ...
        for _, b in ipairs(vim.api.nvim_list_bufs()) do
            if vim.b[b].vscode_uri == uri then
                return { lines = vim.api.nvim_buf_get_lines(b, 0, -1, false), modified = vim.bo[b].modified }
            end
        end
        return vim.NIL
        `,
        [doc.uri.toString()],
    )) as { lines: string[]; modified: boolean } | null;
}

async function assertNvimState(
    client: NeovimClient,
    doc: TextDocument,
    expected: { lines: string[]; modified: boolean | "not checked" },
): Promise<void> {
    await waitUntil(async () => {
        const state = await getNvimState(client, doc);
        assert.ok(state, "No Nvim buffer for the document");
        assert.deepEqual(doc.getText().split("\n"), expected.lines, "VSCode content is wrong");
        assert.deepEqual(state.lines, expected.lines, "Neovim buffer content is out of sync with VSCode");
        if (expected.modified === "not checked") return;
        assert.equal(doc.isDirty, expected.modified, "VSCode isDirty is wrong");
        assert.equal(state.modified, doc.isDirty, "Neovim 'modified' does not match document.isDirty");
    }, 3000);
}

describe("Document edits during Neovim buffer init", function () {
    // The race is made deterministic by the blocking hook; a retry would only hide a failure.
    this.retries(0);

    let client: NeovimClient;
    const tmpFiles: string[] = [];
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
        tmpFiles.forEach((f) => fs.rmSync(f, { force: true }));
    });
    afterEach(async () => {
        await closeAllActiveEditors();
    });

    function makeFile(lines: string[]): string {
        const filePath = path.join(os.tmpdir(), `init-race-${Math.random().toString().slice(2)}.txt`);
        fs.writeFileSync(filePath, lines.join("\n"), { encoding: "utf8" });
        tmpFiles.push(filePath);
        return filePath;
    }

    it("Edits made while init is in flight reach Neovim without a further edit", async () => {
        const doc = await workspace.openTextDocument({ content: "line 1\nline 2" });
        const editor = await showAndWaitForBlockedInit(client, doc);

        assert.ok(await editor.edit((b) => b.insert(new Position(0, 0), "edited ")));
        const wsEdit = new WorkspaceEdit();
        wsEdit.insert(doc.uri, new Position(1, 6), "\nadded");
        assert.ok(await workspace.applyEdit(wsEdit));
        await assertInitNotDone(client);

        await wait(BLOCK_MS);
        // Untitled documents are dirty from the start.
        await assertNvimState(client, doc, { lines: ["edited line 1", "line 2", "added"], modified: true });
    });

    it("Edit during init on a clean file: content synced", async () => {
        const doc = await workspace.openTextDocument(makeFile(["a", "b"]));
        assert.equal(doc.isDirty, false);
        const editor = await showAndWaitForBlockedInit(client, doc);

        assert.ok(await editor.edit((b) => b.insert(new Position(1, 1), "!")));
        await assertInitNotDone(client);

        await wait(BLOCK_MS);
        // 'modified' is not checked: after the first edit of a clean file Nvim's 'modified' ends up
        // false while the document is dirty, independent of this race (processTextDocumentChange only
        // syncs a dirty-state change when isDirty is false).
        await assertNvimState(client, doc, { lines: ["a", "b!"], modified: "not checked" });
    });

    it("Save during init of a dirty file: Neovim 'modified' becomes false, content not applied twice", async () => {
        const doc = await workspace.openTextDocument(makeFile(["a", "b"]));
        // Edited before Nvim knows the document, so the init snapshot already contains it (and is dirty).
        const wsEdit = new WorkspaceEdit();
        wsEdit.insert(doc.uri, new Position(0, 0), "X");
        assert.ok(await workspace.applyEdit(wsEdit));
        assert.equal(doc.isDirty, true);
        await showAndWaitForBlockedInit(client, doc);

        assert.ok(await doc.save());
        assert.equal(doc.isDirty, false);
        await assertInitNotDone(client);

        await wait(BLOCK_MS);
        await assertNvimState(client, doc, { lines: ["Xa", "b"], modified: false });
    });

    it("Changes from before the init snapshot are not replayed into Neovim", async () => {
        const doc = await workspace.openTextDocument(makeFile(["a", "b"]));
        // All before Nvim knows the document: edit, save (a dirty-state change with isDirty=false), edit.
        const edit1 = new WorkspaceEdit();
        edit1.insert(doc.uri, new Position(0, 0), "1");
        assert.ok(await workspace.applyEdit(edit1));
        assert.ok(await doc.save());
        const edit2 = new WorkspaceEdit();
        edit2.insert(doc.uri, new Position(1, 0), "2");
        assert.ok(await workspace.applyEdit(edit2));
        assert.equal(doc.isDirty, true);

        await window.showTextDocument(doc, ViewColumn.One);
        await wait(1000);
        await assertNvimState(client, doc, { lines: ["1a", "2b"], modified: true });
    });

    it("Edit then save during init: content synced and Neovim 'modified' is false", async () => {
        const doc = await workspace.openTextDocument(makeFile(["a", "b"]));
        const editor = await showAndWaitForBlockedInit(client, doc);

        assert.ok(await editor.edit((b) => b.insert(new Position(0, 1), "1")));
        assert.ok(await doc.save());
        assert.equal(doc.isDirty, false);
        await assertInitNotDone(client);

        await wait(BLOCK_MS);
        await assertNvimState(client, doc, { lines: ["a1", "b"], modified: false });
    });
});
