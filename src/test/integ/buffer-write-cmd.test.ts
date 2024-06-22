import { strict as assert } from "assert";
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
    const testFiles: Uri[] = [];

    const readFile = async (uri: Uri): Promise<string | undefined> => {
        try {
            return (await workspace.fs.readFile(uri)).toString();
        } catch {
            // ignore
        }
    };

    const openTestFile = async () => {
        const uri = Uri.file(path.join(process.cwd(), Math.random().toString(36).substring(7)));
        testFiles.push(uri);
        await workspace.fs.writeFile(uri, new TextEncoder().encode("hello world"));
        const doc = await workspace.openTextDocument(uri);
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
        for (const uri of testFiles) {
            try {
                await workspace.fs.delete(uri);
            } catch {
                // ignore
            }
        }
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
});
