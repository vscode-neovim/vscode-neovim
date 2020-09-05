import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    assertContent,
    wait,
    closeAllActiveEditors,
    closeNvimClient,
    sendEscapeKey,
} from "../utils";

describe("Composite escape key", () => {
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

    it("Works", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "",
        });
        await vscode.window.showTextDocument(doc);
        await wait(1000);

        await sendVSCodeKeys("i");
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape1", "j");
        await wait(300);
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape1", "j");
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
        await sendVSCodeKeys("A");
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape1", "j");
        await wait(300);
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape2", "k");
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
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape1", "j");
        await wait(50);
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape1", "j");
        await wait();
        await assertContent(
            {
                content: ["jjjk"],
                mode: "n",
            },
            client,
        );

        await sendVSCodeKeys("i");
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape1", "j");
        await wait(50);
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape2", "k");
        await wait(1000);
        await assertContent(
            {
                content: ["jjjk"],
                mode: "n",
            },
            client,
        );
    });
});
