import { NeovimClient } from "neovim";
import vscode from "vscode";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    wait,
    sendVSCodeKeys,
    assertContent,
    closeNvimClient,
} from "../utils";

// Not possible to test decorator ranges and currently vscode selection is not used for visual modes due to difficultes
describe.skip("Visual modes test", () => {
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

    it("Visual mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "blah abc\nblah2 abc\nblah3 abc",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("w");
        await assertContent(
            {
                cursor: [0, 5],
            },
            client,
        );

        await sendVSCodeKeys("vww", 1000);

        await assertContent(
            {
                cursor: [1, 6],
                vsCodeSelections: [new vscode.Selection(0, 5, 1, 6)],
            },
            client,
        );
        // !Note: vim is different, the cursor should be [0, 5]
        await sendVSCodeKeys("d", 1000);
        await assertContent(
            {
                cursor: [1, 6],
                content: ["blah bc", "blah3 abc"],
                vsCodeSelections: [new vscode.Selection(1, 6, 1, 6)],
            },
            client,
        );

        await sendVSCodeKeys("jwvbbb", 1000);

        await assertContent(
            {
                cursor: [0, 5],
                content: ["blah bc", "blah3 abc"],
                vsCodeSelections: [new vscode.Selection(1, 6, 0, 5)],
            },
            client,
        );
        await sendVSCodeKeys("d", 1000);
        await assertContent(
            {
                cursor: [0, 4],
                // todo: creates empty line
                // content: ["blah ", ""],
                vsCodeSelections: [new vscode.Selection(0, 4, 0, 4)],
            },
            client,
        );
    });

    it("vi-va", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "first\n{\na\nb\nc\n}\nlast",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("jjj");
        await sendVSCodeKeys("vi{");
        await assertContent(
            {
                cursor: [4, 0],
            },
            client,
        );
    });

    it("Visual line mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "blah abc\nblah2 abc\nblah3 abc",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("jll");
        await assertContent(
            {
                cursor: [1, 2],
                mode: "n",
            },
            client,
        );

        await sendVSCodeKeys("V", 500);
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 0, 1, 2), new vscode.Selection(1, 9, 1, 2)],
            },
            client,
        );

        await sendVSCodeKeys("k", 500);
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 0, 2), new vscode.Selection(1, 9, 0, 2)],
            },
            client,
        );

        await sendVSCodeKeys("jj", 500);
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 0, 2, 2), new vscode.Selection(2, 9, 2, 2)],
            },
            client,
        );

        await sendVSCodeKeys("d", 500);
        await assertContent(
            {
                mode: "n",
                cursor: [0, 0],
                vsCodeSelections: [new vscode.Selection(0, 0, 0, 0)],
            },
            client,
        );
    });

    it("Visual block mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "blah abc\nblah2 abc\nblah3 abc",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("jll");
        await assertContent(
            {
                cursor: [1, 2],
                mode: "n",
            },
            client,
        );

        await vscode.commands.executeCommand("vscode-neovim.ctrl-v");
        await wait(1000);
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 2, 1, 2)],
            },
            client,
        );

        await sendVSCodeKeys("l", 500);
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 2, 1, 3)],
            },
            client,
        );

        await sendVSCodeKeys("j", 500);
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 2, 1, 3), new vscode.Selection(2, 2, 2, 3)],
            },
            client,
        );

        await sendVSCodeKeys("kk", 500);
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 2, 1, 3), new vscode.Selection(0, 2, 0, 3)],
            },
            client,
        );

        await sendVSCodeKeys("d", 1000);
        await assertContent(
            {
                cursor: [0, 2],
                mode: "n",
                vsCodeSelections: [new vscode.Selection(0, 2, 0, 2)],
                content: ["bl abc", "bl2 abc", "blah3 abc"],
            },
            client,
        );
    });
});
