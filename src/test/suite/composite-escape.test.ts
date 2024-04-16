import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeCommand,
    assertContent,
    wait,
    closeAllActiveEditors,
    closeNvimClient,
    sendEscapeKey,
    openTextDocument,
    sendInsertKey,
} from "../integrationUtils";

describe("Composite escape key", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Works", async () => {
        await openTextDocument({ content: "" });

        await sendInsertKey();
        await sendVSCodeCommand("vscode-neovim.compositeEscape1", "j");
        await wait(500);
        await sendVSCodeCommand("vscode-neovim.compositeEscape1", "j");
        await assertContent(
            {
                mode: "i",
            },
            client,
        );
        await sendEscapeKey();
        await assertContent(
            {
                content: ["jj"],
            },
            client,
        );
        await sendInsertKey("A");
        await sendVSCodeCommand("vscode-neovim.compositeEscape1", "j");
        await wait(500);
        await sendVSCodeCommand("vscode-neovim.compositeEscape2", "k");
        await assertContent(
            {
                mode: "i",
            },
            client,
        );
        await sendEscapeKey();
        await assertContent(
            {
                content: ["jjjk"],
            },
            client,
        );
        await sendInsertKey();
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape1", "j");
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape1", "j");
        await assertContent(
            {
                content: ["jjjk"],
                mode: "n",
            },
            client,
        );

        await sendInsertKey();
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape1", "j");
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape2", "k");
        await assertContent(
            {
                content: ["jjjk"],
                mode: "n",
            },
            client,
        );
    });
});
