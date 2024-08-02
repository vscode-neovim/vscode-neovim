import { strict as assert } from "assert";

import { NeovimClient } from "neovim";
import { TextEditor, window } from "vscode";

import { EXT_ID } from "../../constants";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendNeovimKeys,
    sendVSCodeCommand,
    sendVSCodeKeys,
    wait,
} from "./integrationUtils";

function findOutputChannel(): TextEditor | undefined {
    // There might be a better way to find the right channel than this...
    return window.visibleTextEditors.find((e) => {
        const { scheme, path } = e.document.uri;
        return scheme === "output" && path.includes(EXT_ID) && path.endsWith("messages");
    });
}

async function sendCommandLine(command: string) {
    await sendVSCodeKeys(":");
    await sendVSCodeCommand("vscode-neovim.test-cmdline", command);
    await sendVSCodeCommand("vscode-neovim.commit-cmdline");
}

async function hideOutputPanel() {
    await sendVSCodeCommand("workbench.action.closePanel");
    await wait();
}

describe("Message output", () => {
    let client: NeovimClient;

    before(async () => {
        client = await attachTestNvimClient();
        // Just for testing consistency with pre-0.10 versions:
        await client.setOption("cmdheight", 0);
        await openTextDocument({ content: "" });
    });

    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    afterEach(async () => {
        await client.command("messages clear");
        await hideOutputPanel();
    });

    it("should reveal output panel with contents", async () => {
        await sendCommandLine("echo 1 | echom 2 | echo 3 | echom 4");
        await wait();
        let outputEditor = findOutputChannel();
        assert.equal(outputEditor?.document.getText(), "1\n2\n3\n4\n");
        await hideOutputPanel();

        await sendCommandLine("messages");
        await wait();
        outputEditor = findOutputChannel();
        assert.equal(outputEditor?.document.getText(), "echomsg: 2\nechomsg: 4\n");
        await hideOutputPanel();

        await sendCommandLine("echo 5 | echo 6 | echo 7");
        await wait();
        outputEditor = findOutputChannel();
        assert.equal(outputEditor?.document.getText(), "5\n6\n7\n");
    });

    it("should reveal after first line", async () => {
        await sendCommandLine("echom 1 | sleep 1 | echom 2 | echom 3");

        // only one line written at first, should not be revealed yet
        let outputEditor = findOutputChannel();
        assert.equal(outputEditor, undefined);

        await wait(1400);
        outputEditor = findOutputChannel();
        assert.equal(outputEditor?.document.getText(), "1\n2\n3\n");
        await hideOutputPanel();

        await sendCommandLine("messages");
        await wait();
        outputEditor = findOutputChannel();
        assert.equal(outputEditor?.document.getText(), "echomsg: 1\nechomsg: 2\nechomsg: 3\n");
    });

    it("should clear history", async () => {
        let outputEditor = findOutputChannel();
        await sendCommandLine("echom 1 | echom 2 | echom 3");
        await wait();
        await sendCommandLine("messages");
        await wait();
        outputEditor = findOutputChannel();
        assert.equal(outputEditor?.document.getText(), "echomsg: 1\nechomsg: 2\nechomsg: 3\n");

        await sendCommandLine("messages clear");
        await wait();
        await sendCommandLine("messages");
        await wait();
        outputEditor = findOutputChannel();
        assert.equal(outputEditor?.document.getText(), "");
    });

    it("should reveal for return prompt", async () => {
        await sendNeovimKeys(client, "/foobar\n");
        await wait();
        let outputEditor = findOutputChannel();
        assert.equal(outputEditor?.document.getText(), "/foobar             \nE486: Pattern not found: foobar\n");

        await sendCommandLine("messages");
        await wait();
        outputEditor = findOutputChannel();
        assert.equal(outputEditor?.document.getText(), "emsg: E486: Pattern not found: foobar\n");
    });
});
