import { strict as assert } from "assert";

import vscode from "vscode";
import { NeovimClient } from "neovim";

import { attachTestNvimClient, sendVSCodeKeys, wait, closeAllActiveEditors, closeNvimClient } from "../utils";

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

    it("Navigates history", async () => {
        const doc = await vscode.workspace.openTextDocument({ content: "abc" });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", 'echo "abc"');
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), 'echo "abc"');

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", 'echo "123"');
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<Up>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), 'echo "123"');

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", "echo ");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<Up>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<Up>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), 'echo "abc"');

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", "echo ");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<Up>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<Up>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<Down>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), 'echo "abc"');

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", "echo");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<Up>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<Up>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<Down>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<Down>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), "echo");
    });

    it("Supports cmdline shortcuts", async () => {
        const doc = await vscode.workspace.openTextDocument({ content: "abc" });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", 'echo "abc 123');
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-w>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", '"');
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), 'echo "abc "');

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", 'echo "abc 123');
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-u>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", '""');
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-h>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), '"');
    });

    it("Supports pasting from register", async () => {
        const doc = await vscode.workspace.openTextDocument({ content: "abc def geh" });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("wyiwwdiw0:");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", '<C-r>"');
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), "geh");

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-r>0");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), "def");

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-r><C-w>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), "abc");
    });

    it("Supports C-l", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["1abc", "", "2abc blah", "3abc blah blah", "4abc"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("/");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", "1");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg('/')"), "1ab");

        await sendVSCodeKeys("/");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", "a");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg('/')"), "abc");

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", "%s/a");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", "/xyz/g");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg('/')"), "abc");
        await wait(1000);

        await sendVSCodeKeys(":");
        await wait(500);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", "%s/x");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.test-cmdline", "/abc/g");
        await wait(100);
        await vscode.commands.executeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg('/')"), "xyz");
    });
});
