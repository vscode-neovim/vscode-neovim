import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    wait,
    sendVSCodeKeys,
    sendEscapeKey,
    assertContent,
} from "../utils";

describe("Simulated insert keys", () => {
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

    it("Ctrl-a", async () => {
        const doc = await vscode.workspace.openTextDocument({ content: "" });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys("i");
        await sendVSCodeKeys("blah blah");
        await sendEscapeKey();

        await sendVSCodeKeys("o");
        await vscode.commands.executeCommand("vscode-neovim.ctrl-a-insert");
        await wait();

        await sendEscapeKey();
        await assertContent(
            {
                content: ["blah blah", "blah blah"],
                cursor: [1, 8],
            },
            client,
        );
    });

    it("Ctrl-r <reg>", async () => {
        const doc = await vscode.workspace.openTextDocument({ content: "blah blah" });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys('"+yy');
        await sendVSCodeKeys("o", 500);

        await vscode.commands.executeCommand("vscode-neovim.paste-register", "+");
        await wait();

        await sendEscapeKey();
        await assertContent(
            {
                content: ["blah blah", "blah blah", ""],
                cursor: [2, 0],
            },
            client,
        );
    });
});
