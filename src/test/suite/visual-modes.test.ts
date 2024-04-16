import { NeovimClient } from "neovim";
import vscode from "vscode";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    sendVSCodeKeys,
    assertContent,
    closeNvimClient,
    sendEscapeKey,
    sendNeovimKeys,
    openTextDocument,
    sendInsertKey,
    wait,
} from "../integrationUtils";

describe("Visual modes test", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Visual mode", async () => {
        await openTextDocument({ content: "blah abc\nblah2 abc\nblah3 abc" });

        await sendVSCodeKeys("w");
        await assertContent(
            {
                cursor: [0, 5],
            },
            client,
        );

        await sendVSCodeKeys("vww");
        await assertContent(
            {
                vsCodeCursor: [1, 7],
                vsCodeSelections: [new vscode.Selection(0, 5, 1, 7)],
            },
            client,
        );
        await sendVSCodeKeys("d");
        await assertContent(
            {
                cursor: [0, 5],
                content: ["blah bc", "blah3 abc"],
                vsCodeSelections: [new vscode.Selection(0, 5, 0, 5)],
            },
            client,
        );

        await sendVSCodeKeys("j$vbbb");
        await assertContent(
            {
                cursor: [0, 5],
                content: ["blah bc", "blah3 abc"],
                // for backward visual mode the anchor pos is extended by + 1, so it's 9 instead of 8 (in vim)
                vsCodeSelections: [new vscode.Selection(1, 9, 0, 5)],
            },
            client,
        );
        await sendVSCodeKeys("d");
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
                vsCodeSelections: [new vscode.Selection(0, 0, 0, 4)],
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
        await openTextDocument({ content: ["first", "{", "a", "b", "c", "}", "last"].join("\n") });

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
                vsCodeCursor: [5, 1],
                vsCodeSelections: [new vscode.Selection(1, 0, 5, 1)],
            },
            client,
        );
        await sendEscapeKey();
        await sendVSCodeKeys("gg");
        await sendVSCodeKeys("gv");
        // no newline, so 0
        await assertContent(
            {
                vsCodeCursor: [5, 1],
                vsCodeSelections: [new vscode.Selection(1, 0, 5, 1)],
            },
            client,
        );
    });

    it("viw on last symbol", async () => {
        await openTextDocument({ content: ["test"].join("\n") });

        await sendVSCodeKeys("lll");
        await sendVSCodeKeys("viw");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 0, 4)],
            },
            client,
        );
    });

    it("Visual line mode", async () => {
        await openTextDocument({ content: ["abc1 abc2 abc3", "abc1 abc2 abc3", "abc1 abc2 abc3"].join("\n") });

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
                vsCodeSelections: [new vscode.Selection(1, 0, 1, 14)],
            },
            client,
        );

        // moves cursor while in visual mode
        await sendVSCodeKeys("w");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 0, 1, 14)],
            },
            client,
        );
        await sendVSCodeKeys("ww");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 0, 2, 14)],
            },
            client,
        );

        await sendVSCodeKeys("kk");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 14, 0, 0)],
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
        await openTextDocument({ content: ["blah1 abc", "blah2 abc", "blah3 abc"].join("\n") });

        await sendVSCodeKeys("jw");
        await assertContent(
            {
                cursor: [1, 6],
                mode: "n",
            },
            client,
        );

        await sendNeovimKeys(client, "<C-v>");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 6, 1, 7)],
            },
            client,
        );

        await sendVSCodeKeys("l");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 6, 1, 8)],
            },
            client,
        );
        await sendVSCodeKeys("j");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(2, 6, 2, 8), new vscode.Selection(1, 6, 1, 8)],
            },
            client,
        );

        await sendVSCodeKeys("kk");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 6, 0, 8), new vscode.Selection(1, 6, 1, 8)],
            },
            client,
        );

        await sendVSCodeKeys("0");
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
        await sendNeovimKeys(client, "<C-v>");
        await sendVSCodeKeys("bjd");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 0, 0, 0)],
                content: ["bc", "bc", "blah3 abc"],
            },
            client,
        );
    });

    it("Smaller or empty line between with visual block mode", async () => {
        await openTextDocument({ content: ["test", "a", "test", "", "test2", "", "test2"].join("\n") });

        await sendVSCodeKeys("ll");
        await sendNeovimKeys(client, "<C-v>");

        await sendVSCodeKeys("j");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 1, 1, 1), new vscode.Selection(0, 3, 0, 1)],
            },
            client,
        );
        await sendVSCodeKeys("j");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(2, 2, 2, 3), new vscode.Selection(0, 2, 0, 3)],
            },
            client,
        );

        await sendInsertKey("A");
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
        await sendVSCodeKeys("jj");

        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(6, 2, 6, 3), new vscode.Selection(4, 2, 4, 3)],
            },
            client,
        );

        await sendInsertKey("I");
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
        await openTextDocument({ content: [" blah1 abc", "  blah2 abc", "blah3 abc"].join("\n") });

        await sendVSCodeKeys("V");
        await sendVSCodeKeys("jj");
        await sendInsertKey("mi");
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

        await sendVSCodeKeys("V");
        await sendVSCodeKeys("jj");
        await sendInsertKey("ma");

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

    it("Visual line mode - multi cursor editing when emoji exists", async () => {
        await openTextDocument({ content: "🦄😊😂🤣" });
        await sendVSCodeKeys("V");
        await sendInsertKey("ma");
        await assertContent(
            {
                mode: "i",
                vsCodeSelections: [new vscode.Selection(0, 8, 0, 8)],
            },
            client,
        );
        await sendVSCodeKeys("test");
        await sendEscapeKey();
        await assertContent(
            {
                mode: "n",
                content: ["🦄😊😂🤣test"],
            },
            client,
        );
    });

    it("Visual block mode - multi cursor editing", async () => {
        await openTextDocument({ content: ["blah1 abc", "blah2 abc", "blah3 abc"].join("\n") });

        await sendVSCodeKeys("jwl");
        await sendNeovimKeys(client, "<C-v>");
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

    it("Visual block mode - selections are ok when selecting one column in multiple rows", async () => {
        await openTextDocument({ content: ["blah1 abc", "blah2 abc", "blah3 abc"].join("\n") });

        await sendVSCodeKeys("l");
        await sendNeovimKeys(client, "<C-v>");
        await sendVSCodeKeys("jj");
        await assertContent(
            {
                vsCodeSelections: [
                    new vscode.Selection(2, 1, 2, 2),
                    new vscode.Selection(1, 1, 1, 2),
                    new vscode.Selection(0, 1, 0, 2),
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

    it("Visual block mode - multi-width chars", async () => {
        await openTextDocument({ content: ["hello", "你好", "hello"].join("\n") });

        await sendNeovimKeys(client, "<C-v>");
        await sendVSCodeKeys("j");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(1, 0, 1, 1), new vscode.Selection(0, 0, 0, 2)],
            },
            client,
        );
        await sendVSCodeKeys("j");
        await assertContent(
            {
                vsCodeSelections: [
                    new vscode.Selection(2, 0, 2, 1),
                    new vscode.Selection(1, 0, 1, 1),
                    new vscode.Selection(0, 0, 0, 1),
                ],
            },
            client,
        );
        await sendVSCodeKeys("l");
        await assertContent(
            {
                vsCodeSelections: [
                    new vscode.Selection(2, 0, 2, 2),
                    new vscode.Selection(1, 0, 1, 1),
                    new vscode.Selection(0, 0, 0, 2),
                ],
            },
            client,
        );
        await sendVSCodeKeys("l");
        await assertContent(
            {
                vsCodeSelections: [
                    new vscode.Selection(2, 0, 2, 3),
                    new vscode.Selection(1, 0, 1, 2),
                    new vscode.Selection(0, 0, 0, 3),
                ],
            },
            client,
        );
    });

    it("Visual mode - $ is ok for upward selection", async () => {
        await openTextDocument({ content: ["blah1 abc", "blah2 abc", "blah3 abc"].join("\n") });

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
        const {
            options: { insertSpaces, tabSize },
        } = await openTextDocument({ content: ["test", "test"].join("\n") });

        await wait(200);
        await client.input(":xmap <LT>buffer> > >gv<CR>");

        await wait(200);
        await sendVSCodeKeys("V");
        await sendVSCodeKeys("j$");
        await sendVSCodeKeys(">");

        await wait(200);
        await sendEscapeKey();

        const indent = insertSpaces ? " ".repeat(tabSize as number) : "\t";
        await assertContent(
            {
                content: [`${indent}test`, `${indent}test`],
                cursor: [1, 4],
            },
            client,
        );

        await wait(200);
        await sendVSCodeKeys("gvd");
        await assertContent(
            {
                content: [""],
            },
            client,
        );
    });
});
