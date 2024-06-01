import { NeovimClient } from "neovim";

import {
    assertContent,
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendEscapeKey,
    sendNeovimKeys,
    sendVSCodeKeys,
} from "./integrationUtils";

describe("Lua vscode.into_insert", function () {
    this.retries(0);

    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
        await client.lua(`
            vim.keymap.set({ "n", "x", "i" }, "<C-d>", function()
              local vscode = require("vscode")
              vscode.into_insert(function()
                vscode.action("editor.action.addSelectionToNextFindMatch")
              end)
            end)
            vim.keymap.set({ "n", "x", "i" }, "<C-i>", function()
              local vscode = require("vscode")
              vscode.into_insert()
              vscode.action("editor.action.addSelectionToNextFindMatch")
            end)
        `);
    });
    after(async () => {
        await client.lua(`
            vim.keymap.del({ "n", "x", "i" }, "<C-d>")
            vim.keymap.del({ "n", "x", "i" }, "<C-i>")
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

    it("addSelectionToNextFindMatch in normal mode", async () => {
        await openTestDocument();
        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0");

        // The cursor changing interrupts the state of VSCode, so repeating the
        // action is necessary to continue selecting, as expected.
        // (0, 0) -> (0, 3)
        await sendNeovimKeys(client, "<C-d>");
        await sendNeovimKeys(client, "<C-d>");
        await sendNeovimKeys(client, "<C-d>");
        await sendNeovimKeys(client, "<C-d>");
        await sendVSCodeKeys("xxx");
        await assertContent({ content: ["xxx", "xxx 123", "12 xxx"] }, client);

        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0ll");
        await sendNeovimKeys(client, "<C-d>");
        await sendNeovimKeys(client, "<C-d>");
        await sendVSCodeKeys("yyy");
        await assertContent({ content: ["yyy", "yyy 123", "12 xxx"] }, client);
    });

    it("no callback", async () => {
        await openTestDocument();
        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0");
        await sendNeovimKeys(client, "<C-i>");
        await sendNeovimKeys(client, "<C-i>");
        await sendNeovimKeys(client, "<C-i>");
        await sendNeovimKeys(client, "<C-i>");
        await sendVSCodeKeys("xxx");
        await assertContent({ content: ["xxx", "xxx 123", "12 xxx"] }, client);

        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0ll");
        await sendNeovimKeys(client, "<C-i>");
        await sendNeovimKeys(client, "<C-i>");
        await sendVSCodeKeys("yyy");
        await assertContent({ content: ["yyy", "yyy 123", "12 xxx"] }, client);
    });

    it("addSelectionToNextFindMatch in insert mode", async () => {
        await openTestDocument();
        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0i");
        await sendNeovimKeys(client, "<C-d>");
        await sendNeovimKeys(client, "<C-d>");
        await sendNeovimKeys(client, "<C-d>");
        await sendNeovimKeys(client, "<C-d>");
        await sendVSCodeKeys("xxx");
        await assertContent({ content: ["xxx", "xxx 123", "12 xxx"] }, client);
    });

    it("addSelectionToNextFindMatch in visual mode", async () => {
        await openTestDocument();
        await sendEscapeKey();
        await sendNeovimKeys(client, "gg0lvl");
        await sendNeovimKeys(client, "<C-d>");
        await sendNeovimKeys(client, "<C-d>");
        await sendNeovimKeys(client, "<C-d>");
        await sendVSCodeKeys("xxx");
        await assertContent({ content: ["axxx", "axxx 123", "12 axxx"] }, client);
    });
});
