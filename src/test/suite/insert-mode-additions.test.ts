import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    sendVSCodeKeys,
    sendEscapeKey,
    sendVSCodeSpecialKey,
    assertContent,
    setCursor,
    openTextDocument,
    sendInsertKey,
    sendVSCodeCommand,
} from "../integrationUtils";

describe("Simulated insert keys", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Handles nvim cursor movement commands after sending ctrl+o key", async () => {
        await openTextDocument({ content: "test" });
        await setCursor(0, 2);
        await sendVSCodeKeys("i123");
        await sendVSCodeCommand("vscode-neovim.send", "<C-o>");
        await sendVSCodeKeys("h");
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
        await openTextDocument({ content: "test" });
        await setCursor(0, 2);
        await sendVSCodeKeys("i123");
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeCommand("vscode-neovim.send", "<C-o>");
        await sendVSCodeKeys("x");
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
        await openTextDocument({ content: "" });

        await sendInsertKey();
        await sendVSCodeKeys("blah blah");
        await sendEscapeKey();

        await sendInsertKey("o");
        await sendVSCodeCommand("vscode-neovim.send", "<C-a>", 500);

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
        await openTextDocument({ content: "blah blah" });

        await sendVSCodeKeys('"yyy');
        await sendInsertKey("o");

        await sendVSCodeCommand("vscode-neovim.send-blocking", "<C-r>");
        await sendVSCodeKeys("y", 200);

        await sendEscapeKey();
        await assertContent(
            {
                content: ["blah blah", "blah blah", ""],
                cursor: [2, 0],
            },
            client,
        );
    });

    it("Ctrl-r <esc>", async () => {
        await openTextDocument({ content: "blah blah" });

        await sendInsertKey("I");
        await sendVSCodeCommand("vscode-neovim.send-blocking", "<C-r>");
        await vscode.commands.executeCommand("vscode-neovim.escape");
        await sendVSCodeKeys("l");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["lblah blah"],
                cursor: [0, 0],
            },
            client,
        );
    });

    it("Ctrl-w/Ctrl-h", async () => {
        await openTextDocument({ content: "blah blah" });

        await sendVSCodeKeys("wi");
        await sendVSCodeCommand("vscode-neovim.send", "<C-w>");

        await sendEscapeKey();
        await assertContent(
            {
                content: ["blah"],
                cursor: [0, 0],
            },
            client,
        );

        await sendVSCodeKeys("ea");
        await sendVSCodeCommand("vscode-neovim.send", "<C-h>");

        await sendEscapeKey();
        await assertContent(
            {
                content: ["bla"],
                cursor: [0, 2],
            },
            client,
        );
    });

    it("Ctrl-u", async () => {
        await openTextDocument({ content: "blah blah" });

        await sendVSCodeKeys("wi");
        await sendVSCodeKeys("blah blah");
        await sendVSCodeCommand("vscode-neovim.send", "<C-u>");

        await sendEscapeKey();
        await assertContent(
            {
                content: ["blah blah"],
                cursor: [0, 4],
            },
            client,
        );
    });
});
