import { strict as assert } from "assert";
import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    wait,
    closeAllActiveEditors,
    closeNvimClient,
} from "../utils";

describe("Command line", () => {
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

    it("Ctrl+L", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["1abc", "", "2abc blah", "3abc blah blah", "4abc"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await sendVSCodeKeys("/a");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search");
        await sendVSCodeKeys("\n");
        assert.equal(await client.commandOutput("echo getreg('/')"), "abc");
    });
});
