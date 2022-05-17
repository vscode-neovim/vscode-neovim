import { strict as assert } from "assert";

import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    wait,
    closeAllActiveEditors,
    closeNvimClient,
    sendVSCodeKeysAtomic,
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

        await sendVSCodeKeysAtomic("/1");
        await wait(1000);
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg('/')"), "1ab");

        await sendVSCodeKeysAtomic("/a");
        await wait(1000);
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg('/')"), "abc");

        await sendVSCodeKeysAtomic(":%s/a");
        await wait(1000);
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await wait(100);
        await sendVSCodeKeys("/xyz/g");
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg('/')"), "abc");

        await sendVSCodeKeysAtomic(":%s/");
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.match-cursor-search-cmdline");
        await wait(100);
        await sendVSCodeKeys("xyz/abc/g");
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg('/')"), "xyz");
    });
});
