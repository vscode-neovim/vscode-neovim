import { strict as assert } from "assert";

import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeCommand,
    sendVSCodeKeys,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    assertContent,
    sendNeovimKeys,
} from "./integrationUtils";

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
        // Clear history so external history does not affect this test
        await sendNeovimKeys(client, ":lua vim.fn.histdel(':')<CR>");

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

    it("Supports multiple levels of the command line", async () => {
        await openTextDocument({ content: "" });
        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", "normal i");
        await sendVSCodeCommand("vscode-neovim.send-cmdline", "<C-r>=");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", "'hello, ' . 'world!'");
        // Commit both levels of the cmdline
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        await assertContent(
            {
                content: ["hello, world!"],
            },
            client,
        );
    });

    // #2079 - plugins can send cmdline inputs very quickly
    it("Should not insert text into the buffer if nvim sends two :s very quickly", async () => {
        await openTextDocument({ content: "some text" });
        // Once the feedkeys is executed, we will immediately hit :
        //
        // the 'ch' in "echo" will put us into insert mode. Broken code would insert " 'hello, world'"
        // NOTE: the string concat of "<" . "CR>" is deliberate, to prevent nvim from sending a <CR> too early.
        await sendNeovimKeys(client, String.raw`:call feedkeys(":echo 'hello, world'<" . "CR>")<CR>`);
        await assertContent(
            {
                content: ["some text"],
            },
            client,
        );
    });

    it("Should not hide the input for an incomplete command if nvim sends two :s very quickly", async () => {
        await openTextDocument({ content: "some text" });

        // We do this with sendNeovimKeys so everything is done quickly
        // A bad implementation will close the command line too early before the commit-cmdline takes effect
        await sendNeovimKeys(client, String.raw`:call feedkeys(":call setline(1, 'hello, world')")<CR>`);
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");
        await assertContent(
            {
                content: ["hello, world"],
            },
            client,
        );
    });

    it("Should allow finishing a command that was set up via neovim inputs", async () => {
        await openTextDocument({ content: "some text" });

        // Set up the command. This could be done by something like a plugin or a mapped key
        await sendNeovimKeys(client, String.raw`:call setline(1, 'hello, world'`);
        await sendVSCodeCommand("vscode-neovim.test-cmdline", ")");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");

        await assertContent(
            {
                content: ["hello, world"],
            },
            client,
        );
    });

    it("Should allow finishing a command that was set up via neovim inputs, even if it was aborted", async () => {
        await openTextDocument({ content: "some text" });
        // Set up the command. This could be done by something like a plugin or a mapped key
        // Put in the command and press esc, so that it's the "last" command, even though we abort
        await sendNeovimKeys(client, String.raw`:call setline(1, 'hello, world'`);
        await sendNeovimKeys(client, String.raw`<ESC>`);

        // Set up the command again
        await sendNeovimKeys(client, String.raw`:call setline(1, 'hello, world'`);
        // A user presses )
        await sendVSCodeCommand("vscode-neovim.test-cmdline", ")");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline");

        await assertContent(
            {
                content: ["hello, world"],
            },
            client,
        );
    });
});
