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
    waitForCondition,
} from "./integrationUtils";

function findOutputChannel(): TextEditor | undefined {
    // There might be a better way to find the right channel than this...
    return window.visibleTextEditors.find((e) => {
        const { scheme, path } = e.document.uri;
        return scheme === "output" && path.includes(EXT_ID) && path.endsWith("messages");
    });
}

// Windows uses \r\n as the line break in output documents, and Nvim right-pads a search
// command with the room it reserves for the search count, so normalize both away.
async function assertOutputContent(expected: string) {
    await waitForCondition(() => {
        const content = findOutputChannel()?.document.getText();
        const normalize = (text: string) => text.replace(/\r\n/g, "\n").replace(/ +$/gm, "");
        assert.equal(content != null ? normalize(content) : content, expected);
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
        await openTextDocument({ content: "" });
    });

    beforeEach(async () => {
        await client.setOption("cmdheight", 2);
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
        await assertOutputContent("1\n2\n3\n4\n");
        await hideOutputPanel();

        await sendCommandLine("messages");
        await assertOutputContent("echomsg: 2\nechomsg: 4\n");
        await hideOutputPanel();

        await sendCommandLine("echo 5 | echo 6 | echo 7");
        await assertOutputContent("5\n6\n7\n");

        // An `empty` message alone clears the output, but not the messages beside it.
        // The panel stays open from above: an empty message reveals nothing by itself.
        await sendCommandLine('echo ""');
        await assertOutputContent("");

        await sendCommandLine('echo "" | echo 8');
        await assertOutputContent("8\n");
    });

    it("should reveal after first line", async () => {
        await sendCommandLine("echom 1 | sleep 1 | echom 2 | echom 3");

        // only one line written at first, should not be revealed yet
        const outputEditor = findOutputChannel();
        assert.equal(outputEditor, undefined);

        await assertOutputContent("1\n2\n3\n");
        await hideOutputPanel();

        await sendCommandLine("messages");
        await assertOutputContent("echomsg: 1\nechomsg: 2\nechomsg: 3\n");
    });

    it("should clear history", async () => {
        await sendCommandLine("echom 1 | echom 2 | echom 3");
        await sendCommandLine("messages");
        await assertOutputContent("echomsg: 1\nechomsg: 2\nechomsg: 3\n");

        await sendCommandLine("messages clear");
        await sendCommandLine("messages");
        await assertOutputContent("");
    });

    it("should reveal for 'pattern not found' for cmdheight=1", async () => {
        await client.setOption("cmdheight", 1);
        await sendNeovimKeys(client, "/foobar\n");
        await assertOutputContent("/foobar\nE486: Pattern not found: foobar\n");

        await sendCommandLine("messages");
        await assertOutputContent("emsg: E486: Pattern not found: foobar\n");
    });

    it("should suppress 'pattern not found' with cmdheight=2", async () => {
        await sendNeovimKeys(client, "/foobar\n");
        await wait();
        const outputEditor = findOutputChannel();
        assert.equal(outputEditor, undefined);

        await sendCommandLine("messages");
        await assertOutputContent("emsg: E486: Pattern not found: foobar\n");
    });
});
