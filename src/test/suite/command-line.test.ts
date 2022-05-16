import { strict as assert } from "assert";

import vscode from "vscode";
import { NeovimClient } from "neovim";

import { attachTestNvimClient, sendVSCodeKeys, wait, closeAllActiveEditors, closeNvimClient, sendEscapeKey } from "../utils";

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

        await sendVSCodeKeys("/");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await sendVSCodeKeys("\n");
        assert.equal(await client.commandOutput("echo getreg('/')"), "1a");

        await sendVSCodeKeys("/a");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await sendVSCodeKeys("\n");
        assert.equal(await client.commandOutput("echo getreg('/')"), "abc");

        await sendVSCodeKeys(":%s/a");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await sendVSCodeKeys("/xyz/g");
        await sendVSCodeKeys("\n");
        assert.equal(await client.commandOutput("echo getreg('/')"), "abc");

        await sendVSCodeKeys(":%s/");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await sendVSCodeKeys("xyz/abc/g");
        await sendVSCodeKeys("\n");
        assert.equal(await client.commandOutput("echo getreg('/')"), "xyz");
    });
});
