import os from "os";
import path from "path";
import fs from "fs";

import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    wait,
    sendVSCodeKeys,
    assertContent,
    sendNeovimKeys,
} from "../utils";

describe("Jumplist & jump actions", () => {
    // abc
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

    it("Resets jumplist for new files", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["1line", "1line"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait(1000);

        await sendNeovimKeys(client, "<C-o>");
        await assertContent(
            {
                content: ["1line", "1line"],
            },
            client,
        );

        const doc2 = await vscode.workspace.openTextDocument({
            content: ["2line", "2line"].join("\n"),
        });
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.Two);
        await wait(1000);

        await sendNeovimKeys(client, "<C-o>");
        await assertContent(
            {
                content: ["2line", "2line"],
            },
            client,
        );

        // close all and open new doc
        await vscode.commands.executeCommand("workbench.action.closeAllEditors");
        await wait(1000);
        const doc3 = await vscode.workspace.openTextDocument({
            content: ["3line", "3line"].join("\n"),
        });
        await vscode.window.showTextDocument(doc3);
        await wait(1000);

        await sendNeovimKeys(client, "<C-o>");
        await assertContent(
            {
                content: ["3line", "3line"],
            },
            client,
        );
    });

    // We don't set jump points anymore from vscode
    it.skip("Switches to existing files and opens closed files", async () => {
        const doc1path = path.join(os.tmpdir(), Math.random().toString() + ".txt");
        const doc2path = path.join(os.tmpdir(), Math.random().toString() + ".txt");
        const doc3path = path.join(os.tmpdir(), Math.random().toString() + ".txt");
        fs.writeFileSync(doc1path, "doc1", { encoding: "utf8" });
        fs.writeFileSync(doc2path, "doc2", { encoding: "utf8" });
        fs.writeFileSync(doc3path, "doc3", { encoding: "utf8" });
        const doc1 = await vscode.workspace.openTextDocument(doc1path);
        const doc2 = await vscode.workspace.openTextDocument(doc2path);
        const doc3 = await vscode.workspace.openTextDocument(doc3path);
        await vscode.window.showTextDocument(doc1, { preview: false });
        await vscode.window.showTextDocument(doc2, { preview: false });
        await vscode.window.showTextDocument(doc3, { preview: false });
        await wait(2000);

        await assertContent(
            {
                content: ["doc3"],
            },
            client,
        );

        await sendNeovimKeys(client, "<C-o>");
        await assertContent(
            {
                content: ["doc2"],
            },
            client,
        );

        await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
        await wait(1000);
        await assertContent(
            {
                content: ["doc3"],
            },
            client,
        );

        await vscode.commands.executeCommand("workbench.action.closeOtherEditors");
        await wait(1000);
        await sendNeovimKeys(client, "<C-o>");
        await wait(1000);
        await assertContent(
            {
                content: ["doc2"],
            },
            client,
        );
    });

    // We don't set jump points anymore from vscode
    it.skip("Editor actions create jump points", async () => {
        const doc1 = await vscode.workspace.openTextDocument(
            path.join(__dirname, "../../../test_fixtures/def-with-scroll.ts"),
        );
        await vscode.window.showTextDocument(doc1);
        await wait(1000);

        await sendVSCodeKeys("gg");
        await vscode.commands.executeCommand("workbench.action.gotoSymbol");
        await wait(1000);
        await vscode.commands.executeCommand("workbench.action.quickOpenSelectNext");
        await wait(1000);
        await vscode.commands.executeCommand("workbench.action.quickOpenSelectNext");
        await wait(1000);
        await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
        await wait(1000);
        await assertContent(
            {
                cursor: [115, 16],
            },
            client,
        );
        await vscode.commands.executeCommand("workbench.action.gotoSymbol");
        await wait(1000);
        await vscode.commands.executeCommand("workbench.action.quickOpenSelectNext");
        await wait(1000);
        await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
        await wait(1000);
        await assertContent(
            {
                cursor: [170, 16],
            },
            client,
        );
        await sendNeovimKeys(client, "<C-o>");
        await assertContent(
            {
                cursor: [115, 16],
            },
            client,
        );
        // await sendVSCodeKeys("<C-i>");
        // await assertContent(
        //     {
        //         cursor: [1, 17],
        //     },
        //     client,
        // );
    });

    it("Jump to definition to another file creates jump point in original file", async () => {
        const doc1 = await vscode.workspace.openTextDocument(path.join(__dirname, "../../../test_fixtures/b.ts"));
        await vscode.window.showTextDocument(doc1);
        await wait(2500);

        await sendVSCodeKeys("jjjjjl");
        await sendVSCodeKeys("gd", 0);
        await wait(2500);

        await sendNeovimKeys(client, "<C-o>");
        await wait(2500);
        await assertContent(
            {
                cursor: [5, 1],
            },
            client,
        );
    });

    it("Jump to definition in same file", async () => {
        const doc1 = await vscode.workspace.openTextDocument(
            path.join(__dirname, "../../../test_fixtures/go-to-def-same-file.ts"),
        );
        await vscode.window.showTextDocument(doc1);
        await wait(2000);

        await sendVSCodeKeys("49j", 0);
        await sendVSCodeKeys("gd");
        await wait(1500);

        await sendVSCodeKeys("j");
        await sendVSCodeKeys("gd");
        await wait(1500);

        await assertContent(
            {
                cursor: [4, 9],
            },
            client,
        );

        await sendNeovimKeys(client, "<C-o>");
        await wait(1000);
        await assertContent(
            {
                cursor: [27, 9],
            },
            client,
        );
        await sendNeovimKeys(client, "<C-o>");
        await wait(1000);
        await assertContent(
            {
                cursor: [49, 0],
            },
            client,
        );
    });
});
