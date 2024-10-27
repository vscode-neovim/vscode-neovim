import { strict as assert } from "assert";
import path from "path";
import { symlink } from "fs/promises";

import { NeovimClient } from "neovim";
import { TextDocument, Uri, commands, window, workspace } from "vscode";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    sendEscapeKey,
    sendVSCodeKeys,
    wait,
} from "./integrationUtils";

describe("BufWriteCmd integration", () => {
    const testFiles: Uri[] = [];
    const cleanupCallbacks: (() => Promise<void>)[] = [];

    const cleanupFile = async (uri: Uri) => {
        try {
            await workspace.fs.delete(uri);
        } catch {
            // ignore
        }
    };
    const cleanupFolder = async (uri: Uri) => {
        try {
            await workspace.fs.delete(uri, { recursive: true, useTrash: false });
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

    const getRandomString = () => Math.random().toString(36).substring(7);

    const openTestFile = async () => {
        const uri = Uri.file(path.join(process.cwd(), getRandomString()));
        cleanupCallbacks.push(() => cleanupFile(uri));
        testFiles.push(uri);
        await workspace.fs.writeFile(uri, new TextEncoder().encode("hello world"));
        const doc = await workspace.openTextDocument(uri);
        assert.equal(doc.getText(), "hello world");
        await window.showTextDocument(doc);
        await sendEscapeKey();
        return doc;
    };

    // Replicate the following hierarchy:
    //   /a/b
    //   /c/test
    // where "/a/b" is a symbolic link to "/c" and "/c/test" is a regular file.
    const openTestFileInSymlinkedWorkspace = async (): Promise<TextDocument> => {
        const folderAPath = path.join(process.cwd(), getRandomString());
        const folderBPath = path.join(folderAPath, getRandomString());
        const testFileSymbolicUri = Uri.file(path.join(folderBPath, "test"));
        const folderCPath = path.join(process.cwd(), getRandomString());
        const testFilePhysicalUri = Uri.file(path.join(folderCPath, "test"));

        await workspace.fs.createDirectory(Uri.file(folderAPath));
        await workspace.fs.createDirectory(Uri.file(folderCPath));
        try {
            await symlink(folderCPath, folderBPath, "dir");
        } catch (_) {
            // ignore, test is called multiple times at once
        }
        cleanupCallbacks.push(() => cleanupFolder(Uri.file(folderCPath)));
        cleanupCallbacks.push(() => cleanupFolder(Uri.file(folderAPath)));

        await workspace.fs.writeFile(testFilePhysicalUri, new TextEncoder().encode("hello friends"));
        const doc = await workspace.openTextDocument(testFileSymbolicUri);
        assert.equal(doc.getText(), "hello friends");
        await window.showTextDocument(doc);
        await sendEscapeKey();
        return doc;
    };

    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await Promise.all(cleanupCallbacks.map((fn) => fn.call(this)));
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });
    afterEach(async () => {
        await closeAllActiveEditors();
    });

    it("Save", async () => {
        const doc = await openTestFile();

        await sendVSCodeKeys("cchello earth");
        await sendEscapeKey();
        assert.equal(doc.isDirty, true);
        assert.equal(doc.getText(), "hello earth");

        await client.command("w");
        await wait(200);
        assert.equal(doc.isDirty, false);
        assert.equal(await readFile(doc.uri), "hello earth");
    });

    it("Writing to command should not trigger saving", async () => {
        const doc = await openTestFile();

        await sendVSCodeKeys("ccaaa");
        await sendEscapeKey();
        assert.equal(doc.isDirty, true);
        assert.equal(doc.getText(), "aaa");

        await client.command("w !cat");
        // ↑May open the output panel
        await wait(200);
        await commands.executeCommand("workbench.action.closePanel");
        assert.equal(doc.isDirty, true);
        assert.equal(doc.getText(), "aaa");
        assert.equal(await readFile(doc.uri), "hello world");
    });

    it("Writing to a file in a symlinked workspace", async () => {
        const doc = await openTestFileInSymlinkedWorkspace();

        await sendVSCodeKeys("cchello world");
        await sendEscapeKey();
        assert.equal(doc.isDirty, true);
        assert.equal(doc.getText(), "hello world");

        await client.command("w");
        await wait(200);
        assert.equal(doc.isDirty, false);
        assert.equal(await readFile(doc.uri), "hello world");
    });
});
