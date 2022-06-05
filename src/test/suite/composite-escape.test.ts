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
    let doc;
    before(async () => {
        client = await attachTestNvimClient();
        doc = await vscode.workspace.openTextDocument({
            content: "",
        });
        await vscode.window.showTextDocument(doc);
        await wait(1000);
    });
    after(async () => {
        await closeAllActiveEditors();
        await closeNvimClient(client);
    });

    beforeEach(async () => await sendVSCodeKeys("S"));

    it("escapes on jk and removes 'j'", async () => {
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape", { key: "j" });
        await wait(50);
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape", { key: "k" });
        await wait(69);
        await assertContent(
            {
                content: [""],
                mode: "n",
            },
            client,
        );
    });

    it("escapes on jj if escOnDoubleTap=true and removes 'j'", async () => {
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape", { key: "j" });
        await wait(50);
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape", { key: "j", escOnDoubleTap: true });
        await wait(50);
        await assertContent(
            {
                content: [""],
                mode: "n",
            },
            client,
        );
    });

    it("does not escape on jj if escOnDoubleTap unset (defaults to false) and does not delete 'jj'", async () => {
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape", { key: "j" });
        await wait(50);
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape", { key: "j" });
        await wait(50);
        await assertContent(
            {
                mode: "i",
            },
            client,
        );
        // without exiting insert mode, vscode won't update the neovim client buffer
        await sendEscapeKey();
        await assertContent(
            {
                content: ["jj"],
            },
            client,
        );
    });

    it("handles default timeoutLen", async () => {
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape", { key: "j" });
        await wait(250);
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape", { key: "k" });
        await wait(50);
        await assertContent(
            {
                mode: "i",
            },
            client,
        );
        await sendEscapeKey();
        await assertContent(
            {
                content: ["jk"],
            },
            client,
        );
    });

    it("handles custom timeoutLen", async () => {
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape", { key: "j" });
        await wait(250);
        await vscode.commands.executeCommand("vscode-neovim.compositeEscape", { key: "k", timeoutLen: 300 });
        await wait(50);
        await assertContent(
            {
                content: [""],
                mode: "n",
            },
            client,
        );
    });
});
