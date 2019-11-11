import { NeovimClient } from "neovim";
import vscode from "vscode";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    wait,
    sendVSCodeKeys,
    assertContent,
    closeNvimClient,
    sendEscapeKey,
} from "../utils";

describe.only("Visual modes test", () => {
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
                vsCodeSelections: [new vscode.Selection(0, 5, 1, 6), new vscode.Selection(1, 7, 1, 6)],
            },
            client,
        );
        await sendVSCodeKeys("d", 1000);
        await assertContent(
            {
                cursor: [0, 5],
                content: ["blah bc", "blah3 abc"],
                // vsCodeSelections: [new vscode.Selection(0, 5, 0, 5), new vscode.Selection(0, 6, 0, 5)],
                // vscode merges selections into one
                vsCodeSelections: [new vscode.Selection(0, 5, 0, 5)],
            },
            client,
        );

        await sendVSCodeKeys("j$vbbb", 1000);

        await assertContent(
            {
                cursor: [0, 5],
                content: ["blah bc", "blah3 abc"],
                // for backward visual mode the anchor pos is extended by + 1, so it's 9 instead of 8 (in vim)
                vsCodeSelections: [new vscode.Selection(1, 9, 0, 5)],
            },
            client,
        );
        await sendVSCodeKeys("d", 1000);
        await assertContent(
            {
                cursor: [0, 4],
                // todo: creates empty line
                // content: ["blah ", ""],
            },
            client,
        );

        // escape key should clear visual mode
        await sendVSCodeKeys("0vlll");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 0, 3), new vscode.Selection(0, 4, 0, 3)],
            },
            client,
        );
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [0, 3],
                vsCodeSelections: [new vscode.Selection(0, 3, 0, 3)],
            },
            client,
        );
    });

    it("vi-va", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["first", "{", "a", "b", "c", "}", "last"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("jjj");
        await sendVSCodeKeys("vi{");
        await assertContent(
            {
                cursor: [4, 1],
                vsCodeSelections: [new vscode.Selection(2, 0, 4, 1)],
            },
            client,
        );

        await sendEscapeKey();
        await sendVSCodeKeys("va{");
        await assertContent(
            {
                cursor: [5, 0],
                vsCodeSelections: [new vscode.Selection(1, 0, 5, 0), new vscode.Selection(5, 1, 5, 0)],
            },
            client,
        );
        await sendEscapeKey();
        await sendVSCodeKeys("gg");
        await sendVSCodeKeys("gv");
        // no newline, so 0
        await assertContent(
            {
                cursor: [5, 0],
                vsCodeSelections: [new vscode.Selection(1, 0, 5, 0), new vscode.Selection(5, 1, 5, 0)],
            },
            client,
        );
    });

    it("Visual line mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["abc1 abc2 abc3", "abc1 abc2 abc3", "abc1 abc2 abc3"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("jw");
        await assertContent(
            {
                cursor: [1, 5],
            },
            client,
        );

        await sendVSCodeKeys("V");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 5, 1, 0), new vscode.Selection(1, 14, 1, 5)],
            },
            client,
        );

        // moves cursor while in visule mode
        await sendVSCodeKeys("w");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 10, 1, 0), new vscode.Selection(1, 14, 1, 10)],
            },
            client,
        );
        await sendVSCodeKeys("ww");
        await assertContent(
            {
                vsCodeSelections: [
                    new vscode.Selection(1, 14, 1, 0),
                    new vscode.Selection(2, 5, 2, 0),
                    new vscode.Selection(2, 14, 2, 5),
                ],
            },
            client,
        );

        await sendVSCodeKeys("kk");
        await assertContent(
            {
                vsCodeSelections: [
                    new vscode.Selection(0, 5, 0, 0),
                    new vscode.Selection(0, 14, 0, 5),
                    new vscode.Selection(1, 14, 1, 0),
                ],
            },
            client,
        );

        await sendEscapeKey();
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 5, 0, 5)],
            },
            client,
        );
    });

    it("Visual block mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["blah1 abc", "blah2 abc", "blah3 abc"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("jw");
        await assertContent(
            {
                cursor: [1, 6],
                mode: "n",
            },
            client,
        );

        await vscode.commands.executeCommand("vscode-neovim.ctrl-v");
        await wait(1500);
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 7, 1, 6)],
            },
            client,
        );

        await sendVSCodeKeys("l");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 6, 1, 7), new vscode.Selection(1, 8, 1, 7)],
            },
            client,
        );
        await sendVSCodeKeys("j");
        await assertContent(
            {
                vsCodeSelections: [
                    new vscode.Selection(1, 6, 1, 7),
                    new vscode.Selection(1, 8, 1, 7),
                    new vscode.Selection(2, 6, 2, 7),
                    new vscode.Selection(2, 8, 2, 7),
                ],
            },
            client,
        );

        await sendVSCodeKeys("kk");
        await assertContent(
            {
                vsCodeSelections: [
                    new vscode.Selection(0, 6, 0, 7),
                    new vscode.Selection(0, 8, 0, 7),
                    new vscode.Selection(1, 6, 1, 7),
                    new vscode.Selection(1, 8, 1, 7),
                ],
            },
            client,
        );

        await sendVSCodeKeys("0", 1000);
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 7, 0, 0), new vscode.Selection(1, 7, 1, 0)],
            },
            client,
        );

        await sendEscapeKey();
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 0, 0)],
            },
            client,
        );

        await sendVSCodeKeys("w");
        await vscode.commands.executeCommand("vscode-neovim.ctrl-v");
        await wait(1000);
        await sendVSCodeKeys("bjd");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 0, 0)],
                content: ["bc", "bc", "blah3 abc"],
            },
            client,
        );
    });
});
