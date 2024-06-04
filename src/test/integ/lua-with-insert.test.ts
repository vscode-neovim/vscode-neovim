import { NeovimClient } from "neovim";
import { Selection } from "vscode";

import {
    assertContent,
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendEscapeKey,
    sendNeovimKeys,
    sendVSCodeCommand,
    sendVSCodeKeys,
    wait,
} from "./integrationUtils";

describe("Lua vscode.with_insert", function () {
    this.retries(0);

    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
        await client.lua(`
            vim.keymap.set({ "n", "x", "i" }, "<C-d>", function()
              local vscode = require("vscode")
              vscode.with_insert(function()
                vscode.action("editor.action.addSelectionToNextFindMatch")
              end)
            end)
        `);
    });
    after(async () => {
        await client.lua(`
            vim.keymap.del({ "n", "x", "i" }, "<C-d>")
        `);
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    beforeEach(async () => {
        await closeAllActiveEditors();
    });

    function openTestDocument() {
        return openTextDocument({
            content: ["abc", "abc 123", "12 abc"].join("\n"),
        });
    }

    async function ctrlD(times = 1) {
        for (let i = 0; i < times; i++) {
            await sendVSCodeCommand("vscode-neovim.send", "<C-d>", 200);
        }
    }

    it("addSelectionToNextFindMatch in normal mode", async () => {
        await openTestDocument();
        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0");
        await ctrlD(3);
        await sendVSCodeKeys("xxx");
        await assertContent({ content: ["xxx", "xxx 123", "12 xxx"] }, client);

        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0ll");
        await ctrlD(2);
        await sendVSCodeKeys("yyy");
        await assertContent({ content: ["yyy", "yyy 123", "12 xxx"] }, client);
    });

    it("addSelectionToNextFindMatch in insert mode", async () => {
        await openTestDocument();
        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0i");
        await ctrlD(3);
        await sendVSCodeKeys("xxx");
        await assertContent({ content: ["xxx", "xxx 123", "12 xxx"] }, client);
    });

    it("addSelectionToNextFindMatch in visual mode", async () => {
        await openTestDocument();
        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0lvl");
        await ctrlD(3);
        await sendVSCodeKeys("xxx");
        await assertContent({ content: ["axxx", "axxx 123", "12 axxx"] }, client);
    });

    it("selectHighlights in visual mode", async () => {
        await openTestDocument();
        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0vll");
        await client.lua(`
            local vscode = require('vscode')
            vscode.with_insert(function()
                vscode.action('editor.action.selectHighlights')
            end)
            `);
        await wait(200);
        await sendVSCodeKeys("xxx");
        await assertContent({ content: ["xxx", "xxx 123", "12 xxx"] }, client);
    });

    it("addSelectionToNextFindMatch in insert mode. Range selected by the mouse", async function () {
        const editor = await openTestDocument();
        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0jA");
        await wait(200);
        editor.selections = [new Selection(0, 1, 0, 3)];
        await wait(200);
        await ctrlD(3);
        await sendVSCodeKeys("xxx");
        await assertContent({ content: ["axxx", "axxx 123", "12 axxx"] }, client);
    });
});
