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
    sendNeovimKeys,
} from "../utils";

describe("Visual modes test", () => {
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

    // visual modes don't produce selections right now
    it.skip("Visual mode", async () => {
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

    // visual modes don't produce selections right now
    it.skip("vi-va", async () => {
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

    // see https://github.com/asvetliakov/vscode-neovim/issues/105
    // visual modes don't produce selections right now
    it.skip("viw on last symbol", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("lll");
        await sendVSCodeKeys("viw");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 0, 3), new vscode.Selection(0, 4, 0, 3)],
            },
            client,
        );
    });

    // visual modes don't produce selections right now
    it.skip("Visual line mode", async () => {
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

        await sendVSCodeKeys("V", 1000);
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 0, 1, 5), new vscode.Selection(1, 14, 1, 5)],
            },
            client,
        );

        // moves cursor while in visule mode
        await sendVSCodeKeys("w");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 0, 1, 10), new vscode.Selection(1, 14, 1, 10)],
            },
            client,
        );
        await sendVSCodeKeys("ww");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 0, 2, 5), new vscode.Selection(2, 14, 2, 5)],
            },
            client,
        );

        await sendVSCodeKeys("kk");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 0, 5), new vscode.Selection(1, 14, 0, 5)],
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

    // visual modes don't produce selections right now
    it.skip("Visual block mode", async () => {
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

        await sendVSCodeKeys("<C-v>");
        await wait(1000);
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
        await sendVSCodeKeys("<C-v>");
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

    // visual modes don't produce selections right now
    it("Smaller or empty line between with visual block mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test", "a", "test", "", "test2", "", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys("ll");
        await sendNeovimKeys(client, "<C-v>");
        await wait(1000);

        await sendVSCodeKeys("j");
        // await assertContent(
        //     {
        //         vsCodeSelections: [new vscode.Selection(0, 3, 0, 1), new vscode.Selection(1, 1, 1, 1)],
        //     },
        //     client,
        // );
        await sendVSCodeKeys("j");
        // await assertContent(
        //     {
        //         vsCodeSelections: [new vscode.Selection(0, 3, 0, 2), new vscode.Selection(2, 3, 2, 2)],
        //     },
        //     client,
        // );

        await sendVSCodeKeys("A");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();

        // A creates empty spaces to fill line
        await assertContent(
            {
                content: ["tesblaht", "a  blah", "tesblaht", "", "test2", "", "test2"],
            },
            client,
        );

        await sendVSCodeKeys("0jjjjll");
        await sendNeovimKeys(client, "<C-v>");
        await wait(1000);
        await sendVSCodeKeys("jj");

        // await assertContent(
        //     {
        //         vsCodeSelections: [new vscode.Selection(4, 3, 4, 2), new vscode.Selection(6, 3, 6, 2)],
        //     },
        //     client,
        // );

        await sendVSCodeKeys("I");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        // I doens't create empty spaces
        await assertContent(
            {
                content: ["tesblaht", "a  blah", "tesblaht", "", "teblahst2", "", "teblahst2"],
            },
            client,
        );
    });

    it("Visual line mode - multi cursor editing", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: [" blah1 abc", "  blah2 abc", "blah3 abc"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("V", 1000);
        await sendVSCodeKeys("jj", 1000);
        await sendVSCodeKeys("mi");
        await assertContent(
            {
                mode: "i",
                vsCodeSelections: [
                    new vscode.Selection(0, 1, 0, 1),
                    new vscode.Selection(1, 2, 1, 2),
                    new vscode.Selection(2, 0, 2, 0),
                ],
            },
            client,
        );

        await sendVSCodeKeys("test");
        await sendEscapeKey();
        await assertContent(
            {
                mode: "n",
                content: [" testblah1 abc", "  testblah2 abc", "testblah3 abc"],
            },
            client,
        );

        await sendVSCodeKeys("V", 1000);
        await sendVSCodeKeys("jj", 1000);
        await sendVSCodeKeys("ma");
        await wait(1000);

        await assertContent(
            {
                mode: "i",
                vsCodeSelections: [
                    new vscode.Selection(0, 14, 0, 14),
                    new vscode.Selection(1, 15, 1, 15),
                    new vscode.Selection(2, 13, 2, 13),
                ],
            },
            client,
        );

        await sendVSCodeKeys("test");
        await sendEscapeKey();
        await assertContent(
            {
                mode: "n",
                content: [" testblah1 abctest", "  testblah2 abctest", "testblah3 abctest"],
            },
            client,
        );
    });

    it("Visual block mode - multi cursor editing", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["blah1 abc", "blah2 abc", "blah3 abc"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("jw");
        await sendNeovimKeys(client, "<C-v>");
        await wait(1000);
        await sendVSCodeKeys("lk");
        await sendVSCodeKeys("mi");
        await assertContent(
            {
                mode: "i",
                vsCodeSelections: [new vscode.Selection(0, 7, 0, 7), new vscode.Selection(1, 7, 1, 7)],
            },
            client,
        );

        await sendVSCodeKeys("test");
        await sendEscapeKey();
        await assertContent(
            {
                mode: "n",
                content: ["blah1 atestbc", "blah2 atestbc", "blah3 abc"],
            },
            client,
        );

        await sendVSCodeKeys("l");
        await sendNeovimKeys(client, "<C-v>");
        await wait(1000);
        await sendVSCodeKeys("j");
        await sendVSCodeKeys("ma");
        await assertContent(
            {
                mode: "i",
                vsCodeSelections: [new vscode.Selection(0, 12, 0, 12), new vscode.Selection(1, 12, 1, 12)],
            },
            client,
        );
        await sendVSCodeKeys("test");
        await sendEscapeKey();
        await assertContent(
            {
                mode: "n",
                content: ["blah1 atestbtestc", "blah2 atestbtestc", "blah3 abc"],
            },
            client,
        );
    });

    // visual modes don't produce selections right now
    it.skip("Visual block mode - selections are ok when selecting one column in multiple rows", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["blah1 abc", "blah2 abc", "blah3 abc"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("l");
        await sendVSCodeKeys("<C-v>");
        await wait(1000);
        await sendVSCodeKeys("jj");

        await assertContent(
            {
                vsCodeSelections: [
                    new vscode.Selection(0, 2, 0, 1),
                    new vscode.Selection(1, 2, 1, 1),
                    new vscode.Selection(2, 2, 2, 1),
                ],
            },
            client,
        );

        // test cursor position by inserting t here
        await sendVSCodeKeys("I");
        await sendVSCodeKeys("t");
        await sendEscapeKey();
        await assertContent({ content: ["btlah1 abc", "btlah2 abc", "btlah3 abc"] }, client);
    });

    // visual modes don't produce selections right now
    it.skip("Visual mode - $ is ok for upward selection", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["blah1 abc", "blah2 abc", "blah3 abc"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys("jllv");
        await sendVSCodeKeys("k$");
        await assertContent(
            {
                cursor: [0, 9],
                vsCodeSelections: [new vscode.Selection(1, 3, 0, 9)],
            },
            client,
        );
    });

    it("Cursor is ok for multiple cursor updates - issue #141", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test", "test"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait();
        await client.input(":xmap <LT>buffer> > >gv<CR>");

        await sendVSCodeKeys("V");
        await sendVSCodeKeys("j$");

        await sendVSCodeKeys(">");
        await wait(1000);
        await assertContent(
            {
                content: ["    test", "    test"],
                cursor: [1, 4],
            },
            client,
        );
        await sendVSCodeKeys("d");
        await assertContent(
            {
                content: [""],
            },
            client,
        );
    });
});
