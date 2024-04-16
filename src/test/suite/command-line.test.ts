import { strict as assert } from "assert";

import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeCommand,
    sendVSCodeKeys,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
} from "../integrationUtils";

describe("Command line", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Navigates history", async () => {
        await openTextDocument({ content: "abc" });

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", 'echo "abc"');
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), 'echo "abc"');

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", 'echo "123"');
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<Up>");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), 'echo "123"');

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", "echo ");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<Up>");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<Up>");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), 'echo "abc"');

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", "echo ");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<Up>");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<Up>");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<Down>");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), 'echo "abc"');

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", "echo");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<Up>");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<Up>");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<Down>");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<Down>");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), "echo");
    });

    it("Supports cmdline shortcuts", async () => {
        await openTextDocument({ content: "abc" });

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", 'echo "abc 123');
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-w>");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", '"');
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), 'echo "abc "');

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", 'echo "abc 123');
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-u>");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", '""');
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-h>");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), '"');
    });

    it("Supports pasting from register", async () => {
        await openTextDocument({ content: "abc def geh" });

        await sendVSCodeKeys("wyiwwdiw0:");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", '<C-r>"');
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), "geh");

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-r>0");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), "def");

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-r><C-w>");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg(':')"), "abc");
    });

    it("Supports C-l", async () => {
        await openTextDocument({ content: ["1abc", "", "2abc blah", "3abc blah blah", "4abc"].join("\n") });

        await sendVSCodeKeys("/");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", "1");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg('/')"), "1ab");

        await sendVSCodeKeys("/");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", "a");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-l>");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        assert.equal(await client.commandOutput("echo getreg('/')"), "abc");

        await client.call("setreg", ["/", ""]);

        // fails in macos
        // await sendVSCodeKeys(":");
        // await sendVSCodeCommand("vscode-neovim.test-cmdline", "%s/a");
        // await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-l>");
        // await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-l>");
        // await sendVSCodeCommand("vscode-neovim.test-cmdline", "/xyz/g");
        // await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        // assert.equal(await client.commandOutput("echo getreg('/')"), "abc");

        // await sendVSCodeKeys(":");
        // await sendVSCodeCommand("vscode-neovim.test-cmdline", "%s/x");
        // await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-l>");
        // await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-l>");
        // await sendVSCodeCommand("vscode-neovim.test-cmdline", "/abc/g");
        // await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        // assert.equal(await client.commandOutput("echo getreg('/')"), "xyz");
    });
});
