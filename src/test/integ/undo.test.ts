import os from "os";
import path from "path";
import { strict as assert } from "assert";

import vscode, { commands, window } from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    assertContent,
    wait,
    sendEscapeKey,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendInsertKey,
} from "./integrationUtils";

describe("Undo", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("U in new buffer doesnt undo initial content", async () => {
        await openTextDocument({ content: "some line\notherline" });
        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["some line", "otherline"],
            },
            client,
        );
    });

    it("Undo points are correct after the insert mode", async () => {
        await openTextDocument({ content: "some line\notherline" });
        // for some reason sending both jA fails
        await sendVSCodeKeys("j");
        await sendInsertKey("A");
        await sendVSCodeKeys("\nblah");
        await sendEscapeKey();

        await sendInsertKey("A");
        await sendVSCodeKeys("\nblah");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["some line", "otherline", "blah", "blah"],
            },
            client,
        );

        await sendVSCodeKeys("u", 500);
        await assertContent(
            {
                content: ["some line", "otherline", "blah"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["some line", "otherline"],
            },
            client,
        );
    });

    it("Undo points are correct after newlines", async () => {
        await openTextDocument({ content: "some line\notherline" });
        await sendVSCodeKeys("jo");
        await sendVSCodeKeys("blah\nblah");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["some line", "otherline", "blah", "blah"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["some line", "otherline"],
            },
            client,
        );
    });

    it("Undo points are correct after newlines - 2", async () => {
        await openTextDocument({ content: "" });
        await sendInsertKey();
        await sendVSCodeKeys("blah\notherblah");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah", "otherblah"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: [""],
            },
            client,
        );
    });

    it("Buffer is ok after undo and o", async () => {
        await openTextDocument({ content: "a\nb" });
        await sendVSCodeKeys("yy");
        await sendVSCodeKeys("p");
        await sendVSCodeKeys("u");
        await sendInsertKey("o");

        await sendEscapeKey();
        await assertContent(
            {
                content: ["a", "", "b"],
                cursor: [1, 0],
            },
            client,
        );
        await sendVSCodeKeys("itest");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["a", "test", "b"],
            },
            client,
        );
        await sendVSCodeKeys("dd");
        await assertContent(
            {
                content: ["a", "b"],
            },
            client,
        );
    });

    it("Buffer ok after undo - 2", async () => {
        await openTextDocument({ content: "" });

        await sendVSCodeKeys("ia\nb\n\nc");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["a", "b", "", "c"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: [""],
            },
            client,
        );
    });

    it("Undo after switching tabs", async () => {
        const doc1 = await vscode.workspace.openTextDocument({
            content: ["1"].join("\n"),
        });
        const doc2 = await vscode.workspace.openTextDocument({
            content: ["2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc1, vscode.ViewColumn.One);
        await wait(500);
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.One);
        await wait(500);
        await assertContent({ content: ["2"] }, client);
        await sendInsertKey("A");
        await sendVSCodeKeys("test");
        await sendEscapeKey();
        await assertContent({ content: ["2test"] }, client);
        await sendVSCodeKeys("gT");
        await sendVSCodeKeys("gt");
        await wait(500);
        await sendVSCodeKeys("u");
        await assertContent({ content: ["2"] }, client);
    });

    const checkDirtyStatus = async (expected: boolean) => {
        await wait(100);
        const modified = await client.lua("return vim.bo.mod");
        const isDirty = window.activeTextEditor!.document.isDirty;
        assert.deepEqual({ modified, isDirty }, { modified: expected, isDirty: expected });
        await wait(100);
    };

    it("Should clear isDirty flag after undo all changes (Nvim)", async () => {
        const uri = vscode.Uri.file(path.join(os.tmpdir(), Math.random().toString(36).substring(7)));
        await vscode.workspace.fs.writeFile(uri, new Uint8Array(Buffer.from("aaa\nbbb\nccc")));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await checkDirtyStatus(false);
        await sendVSCodeKeys("diw");
        await checkDirtyStatus(true);
        await sendVSCodeKeys("0jlx");
        await checkDirtyStatus(true);
        await sendVSCodeKeys("u");
        await checkDirtyStatus(true);
        await sendVSCodeKeys("u");
        await checkDirtyStatus(false);
        await assertContent({ content: ["aaa", "bbb", "ccc"] }, client);
    });

    it("Should reset modified flag after undo all changes (VSCode)", async () => {
        const uri = vscode.Uri.file(path.join(os.tmpdir(), Math.random().toString(36).substring(7)));
        await vscode.workspace.fs.writeFile(uri, new Uint8Array(Buffer.from("aaa")));
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
        await checkDirtyStatus(false);
        await sendVSCodeKeys("i test");
        await sendEscapeKey();
        await checkDirtyStatus(true);
        await commands.executeCommand("undo");
        await checkDirtyStatus(false);
        await assertContent({ content: ["aaa"] }, client);
    });
});
