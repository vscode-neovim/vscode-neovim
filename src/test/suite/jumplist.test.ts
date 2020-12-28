import path from "path";

import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    wait,
    sendVSCodeKeys,
    assertContent,
    sendNeovimKeys,
} from "../utils";

describe("Jumplist & jump actions", () => {
    // abc
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

    it("Jump to definition to another file", async () => {
        const doc1 = await vscode.workspace.openTextDocument(path.join(__dirname, "../../../test_fixtures/b.ts"));
        await vscode.window.showTextDocument(doc1);
        await wait(2500);

        await sendVSCodeKeys("jjjjjl");
        await sendVSCodeKeys("gd", 0);
        await wait(2500);

        await sendNeovimKeys(client, "<C-o>");
        await wait(2500);
        await assertContent(
            {
                cursor: [5, 1],
            },
            client,
        );
    });

    it("Jump to definition in same file", async () => {
        const doc1 = await vscode.workspace.openTextDocument(
            path.join(__dirname, "../../../test_fixtures/go-to-def-same-file.ts"),
        );
        await vscode.window.showTextDocument(doc1);
        await wait(2500);

        await sendVSCodeKeys("49j", 0);
        await sendVSCodeKeys("gd");
        await wait(2500);

        await sendVSCodeKeys("j");
        await sendVSCodeKeys("gd");
        await wait(2500);

        await assertContent(
            {
                cursor: [4, 9],
            },
            client,
        );

        await sendNeovimKeys(client, "<C-o>");
        await wait(2500);
        await assertContent(
            {
                cursor: [27, 9],
            },
            client,
        );
        await sendNeovimKeys(client, "<C-o>");
        await wait(2500);
        await assertContent(
            {
                cursor: [49, 0],
            },
            client,
        );
    });
});
