import { strict as assert } from "assert";

import { NeovimClient } from "neovim";
import vscode from "vscode";

import {
    assertContent,
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendEscapeKey,
    sendInsertKey,
    sendVSCodeKeys,
    wait,
} from "./integrationUtils";

describe("Composite escape key", () => {
    let client: NeovimClient;
    before(async () => {
        await vscode.workspace.getConfiguration("vscode-neovim").update(
            "compositeKeys",
            {
                jj: {
                    command: "vscode-neovim.escape",
                },
                jk: {
                    command: "vscode-neovim.lua",
                    args: ["vim.g.__composite_escape_test = 'jk'"],
                },
            },
            vscode.ConfigurationTarget.Global,
        );
        await wait(200);
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
        await vscode.workspace
            .getConfiguration("vscode-neovim")
            .update("compositeKeys", undefined, vscode.ConfigurationTarget.Global);
    });

    it("Works", async () => {
        await openTextDocument({ content: "" });

        await sendInsertKey();
        await sendVSCodeKeys("j", 500); // Default composite time is 300ms
        await assertContent(
            {
                mode: "i",
                content: ["j"],
            },
            client,
        );

        await sendEscapeKey();
        await sendInsertKey("A");
        await sendVSCodeKeys("jj");
        await assertContent(
            {
                mode: "n",
                content: ["j"],
            },
            client,
        );

        await sendInsertKey("A");
        await sendVSCodeKeys("jk");
        await assertContent(
            {
                mode: "i",
                content: ["j"],
            },
            client,
        );
        const test = await client.getVar("__composite_escape_test");
        assert.equal(test, "jk");

        await sendVSCodeKeys("jljj0");
        await assertContent(
            {
                mode: "n",
                content: ["jjl"],
                cursor: [0, 0],
            },
            client,
        );
    });
});
