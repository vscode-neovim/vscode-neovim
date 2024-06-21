import { strict as assert } from "assert";
import os from "os";
import path from "path";

import { NeovimClient } from "neovim";
import { Uri, commands, window, workspace } from "vscode";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    sendEscapeKey,
    sendVSCodeKeys,
    wait,
} from "./integrationUtils";

describe("BufWriteCmd integration", () => {
    const testFile = Uri.file(path.join(os.tmpdir(), "bufwritecmd.txt"));

    const deleteTestFiles = async () => {
        try {
            await workspace.fs.delete(testFile);
        } catch {
            // ignore
        }
    };

    const readFile = async (uri: Uri): Promise<string | undefined> => {
        try {
            return (await workspace.fs.readFile(uri)).toString();
        } catch {
            // ignore
        }
    };

    const openTestFile = async () => {
        await workspace.fs.writeFile(testFile, new TextEncoder().encode("hello world"));
        const doc = await workspace.openTextDocument(testFile);
        assert.equal(doc.getText(), "hello world");
        await window.showTextDocument(doc);
        await sendEscapeKey();
        return doc;
    };

    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });
    beforeEach(async () => {
        await deleteTestFiles();
        await closeAllActiveEditors();
    });
    afterEach(async () => {
        await deleteTestFiles();
        await closeAllActiveEditors();
    });

    it("Save", async () => {
        const doc = await openTestFile();

        // 1
        await sendVSCodeKeys("cchello earth");
        await sendEscapeKey();
        assert.equal(doc.isDirty, true);
        assert.equal(doc.getText(), "hello earth");

        await client.command("w");
        await wait(100);
        assert.equal(doc.isDirty, false);
        assert.equal(await readFile(testFile), "hello earth");
    });

    it("Writing to command does not trigger saving", async () => {
        const doc = await openTestFile();

        await sendVSCodeKeys("ccaaa");
        await sendEscapeKey();
        assert.equal(doc.isDirty, true);
        assert.equal(doc.getText(), "aaa");

        await client.command("w !cat");
        // ↑May open the output panel
        await wait(100);
        await commands.executeCommand("workbench.action.closePanel");
        assert.equal(doc.isDirty, true);
        assert.equal(doc.getText(), "aaa");
        assert.equal(await readFile(testFile), "hello earth");
    });
});
