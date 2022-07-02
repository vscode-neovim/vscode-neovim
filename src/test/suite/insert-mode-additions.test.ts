import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    wait,
    sendVSCodeKeys,
    sendEscapeKey,
    sendVSCodeSpecialKey,
    assertContent,
    setCursor,
} from "../utils";

describe("Simulated insert keys", () => {
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

    it("Handles nvim cursor movement commands after sending ctrl+o key", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "test",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await setCursor(0, 2);
        await sendVSCodeKeys("i123");
        await wait();
        await vscode.commands.executeCommand("vscode-neovim.sync-send", "<C-o>");
        await wait();
        await sendVSCodeKeys("h");
        await wait();
        await assertContent(
            {
                mode: "i",
                cursor: [0, 4],
                content: ["te123st"],
            },
            client,
        );
    });

    it("Handles nvim editing commands after sending ctrl+o key", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "test",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await setCursor(0, 2);
        await sendVSCodeKeys("i123");
        await wait();
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");
        await wait();
        await vscode.commands.executeCommand("vscode-neovim.sync-send", "<C-o>");
        await wait();
        await sendVSCodeKeys("x");
        await wait();
        await assertContent(
            {
                mode: "i",
                cursor: [0, 3],
                content: ["te13st"],
            },
            client,
        );
    });

    it("Ctrl-a", async () => {
        const doc = await vscode.workspace.openTextDocument({ content: "" });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys("i");
        await sendVSCodeKeys("blah blah");
        await sendEscapeKey();

        await sendVSCodeKeys("o");
        await vscode.commands.executeCommand("vscode-neovim.sync-send", "<C-a>");
        await wait();

        await sendEscapeKey();
        await assertContent(
            {
                content: ["blah blah", "blah blah"],
                cursor: [1, 8],
            },
            client,
        );
    });

    it("Ctrl-r <reg>", async () => {
        const doc = await vscode.workspace.openTextDocument({ content: "blah blah" });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys('"+yy');
        await sendVSCodeKeys("o", 500);

        await vscode.commands.executeCommand("vscode-neovim.paste-register", "<C-r>");
        await sendVSCodeKeys("+");
        await wait();

        await sendEscapeKey();
        await sendVSCodeKeys("k");
        await assertContent(
            {
                content: ["blah blah", "blah blah", ""],
                cursor: [1, 0],
            },
            client,
        );
    });

    it("Ctrl-r <esc>", async () => {
        const doc = await vscode.workspace.openTextDocument({ content: "blah blah" });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys("I");
        await vscode.commands.executeCommand("vscode-neovim.paste-register", "<C-r>");
        await sendEscapeKey();
        await sendVSCodeKeys("l");
        await wait();
        await sendEscapeKey();

        await assertContent(
            {
                content: ["lblah blah"],
                cursor: [0, 0],
            },
            client,
        );
    });
});
