import { strict as assert } from "assert";

import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    closeActiveEditor,
    sendVSCodeKeys,
    sendVSCodeCommand,
    getVScodeCursor,
    getNeovimCursor,
    openTextDocument,
    sendVSCodeKeysAtomic,
    wait,
    waitForCondition,
} from "./integrationUtils";

// The help buffer reaches VSCode a moment after the Ex command returns.
async function assertActiveEditorMatches(banner: RegExp, what: string): Promise<void> {
    await waitForCondition(() => {
        const text = vscode.window.activeTextEditor?.document.getText() ?? "";
        assert.ok(banner.test(text), `${what} missing expected banner, got: ${text.slice(0, 200)}`);
    });
}

describe("Neovim external buffers", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    beforeEach(async () => {
        await closeAllActiveEditors();
    });

    it("Opens VIM help", async () => {
        await openTextDocument({ content: "blah" });

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", "help");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline", "", 1000);

        await assertActiveEditorMatches(/NVIM DOCUMENTATION|Nvim documentation|MAIN HELP FILE/i, "help index");

        await sendVSCodeKeys(":");
        await sendVSCodeCommand("vscode-neovim.test-cmdline", "help options");
        await sendVSCodeCommand("vscode-neovim.commit-cmdline", "", 1000);

        await assertActiveEditorMatches(/VIM REFERENCE MANUAL|REFERENCE MANUAL|options\.txt/i, "help options");

        await closeActiveEditor();
    });

    it("Cursor for external buffers is OK", async function () {
        this.retries(3);

        await openTextDocument({ content: "blah" });
        await wait(2000);

        await sendVSCodeKeysAtomic(":help local-options", 500);
        await sendVSCodeCommand("vscode-neovim.commit-cmdline", "", 2000);
        await sendVSCodeKeys("$0");

        const vscodeCursor = getVScodeCursor();
        const neovimCursor = await getNeovimCursor(client);
        const text = vscode.window.activeTextEditor!.document.getText();

        assert.ok(neovimCursor[0] !== 0);
        assert.ok(vscodeCursor[0] === neovimCursor[0]);
        assert.equal(text.split("\n")[neovimCursor[0]], "Handling of local options			*local-options*");
    });
});
