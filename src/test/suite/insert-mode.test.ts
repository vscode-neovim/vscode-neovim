import vscode, { Selection } from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    wait,
    sendVSCodeKeys,
    assertContent,
    sendEscapeKey,
    sendVSCodeSpecialKey,
    setSelection,
    copyVSCodeSelection,
    pasteVSCode,
    openTextDocument,
    sendInsertKey,
    sendVSCodeCommand,
    sendVSCodeKeysAtomic,
} from "../integrationUtils";

describe("Insert mode and buffer synchronization", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Line change", async () => {
        await openTextDocument({ content: "blah\nblah2" });

        await sendVSCodeKeys("ll");
        await sendInsertKey();
        await sendVSCodeKeys("test");
        await sendVSCodeSpecialKey("cursorDown");
        await sendVSCodeKeys("test");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["bltestah", "blah2test"],
            },
            client,
        );
    });

    it("Inserting line breaks", async () => {
        await openTextDocument({ content: "blah\nblah2" });

        await sendInsertKey();
        await sendVSCodeKeys("\n");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["", "blah", "blah2"],
                cursor: [1, 0],
            },
            client,
        );

        await sendVSCodeKeys("lli");
        await sendVSCodeKeys("\n");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["", "bl", "ah", "blah2"],
                cursor: [2, 0],
            },
            client,
        );

        await sendVSCodeKeys("lla");
        await sendVSCodeKeys("\n");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["", "bl", "ah", "", "blah2"],
                cursor: [3, 0],
            },
            client,
        );
    });

    it("Deleting lines - backspace", async () => {
        await openTextDocument({ content: ["blah1", "", "", "blah2", "", "", "", "blah3"].join("\n") });

        await sendVSCodeKeys("jjj");
        await sendInsertKey("i");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah1", "blah2", "", "", "", "blah3"],
            },
            client,
        );

        await sendVSCodeKeys("jjjj");
        await sendInsertKey("i");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah1", "blah2blah3"],
            },
            client,
        );
    });

    it("Deleting lines - del", async () => {
        await openTextDocument({ content: ["blah1", "", "", "blah2"].join("\n") });

        await sendInsertKey("A");
        await sendVSCodeSpecialKey("delete");
        await sendVSCodeSpecialKey("delete");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah1", "blah2"],
            },
            client,
        );
        await sendInsertKey("a");
        await sendVSCodeSpecialKey("delete");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah1blah2"],
            },
            client,
        );
    });

    it("Inserting snippet", async () => {
        await openTextDocument({ content: ["blah1", "", "blah2"].join("\n") });

        await sendVSCodeKeys("ji");
        await vscode.window.activeTextEditor!.insertSnippet(new vscode.SnippetString("while ($1) {\n$2\n}"));
        await wait(200);
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah1", "while () {", "", "}", "blah2"],
                cursor: [1, 6],
            },
            client,
        );
    });

    it("Changes after inserting and deleting newlines", async () => {
        await openTextDocument({ content: ["blah1", "", "", "blah2", "", "blah3"].join("\n") });

        // go to end of blah2
        await sendVSCodeKeys("jjj");
        await sendInsertKey("A");
        await sendVSCodeKeys("test");
        // go to newline before
        await sendVSCodeSpecialKey("cursorUp");
        // delete newline
        await sendVSCodeSpecialKey("delete");
        // go to end of blah3
        await sendVSCodeSpecialKey("cursorDown");
        await sendVSCodeSpecialKey("cursorDown");
        await sendVSCodeSpecialKey("cursorDown");
        // append test to blah3
        await sendVSCodeKeys("test");
        // go up
        await sendVSCodeSpecialKey("cursorUp");
        // insert two newlines
        await sendVSCodeKeys("\n");
        await sendVSCodeKeys("\n");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah1", "", "blah2test", "", "", "", "blah3test"],
            },
            client,
        );
    });

    it("Deleting multiple lines", async () => {
        await openTextDocument({ content: ["blah1", "", "", "blah2", "", "blah3"].join("\n") });

        await sendVSCodeKeys("jjj");
        await sendInsertKey("A");
        await sendVSCodeKeys("test");

        await setSelection(new Selection(0, 0, 3, 0));
        await sendVSCodeSpecialKey("delete");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah2test", "", "blah3"],
            },
            client,
        );
    });

    it("Replacing multiple lines - line num doesn't change", async () => {
        await openTextDocument({ content: ["a", "b", "blah1", "blah2"].join("\n") });

        await sendInsertKey("i");
        await setSelection(new Selection(0, 0, 1, 1));
        await copyVSCodeSelection();

        await setSelection(new Selection(2, 0, 4, 0));
        await pasteVSCode();
        await sendEscapeKey();

        await assertContent(
            {
                content: ["a", "b", "a", "b"],
            },
            client,
        );
    });

    it("Replacing multiple lines - line num increases", async () => {
        await openTextDocument({ content: ["a", "b", "blah1", "blah2"].join("\n") });

        await sendInsertKey();
        await setSelection(new Selection(0, 0, 1, 1));
        await copyVSCodeSelection();

        await setSelection(new Selection(2, 0, 2, 5));
        await pasteVSCode();

        await sendEscapeKey();

        await assertContent(
            {
                content: ["a", "b", "a", "b", "blah2"],
            },
            client,
        );
    });

    it("Replacing multiple lines - line num decreases", async () => {
        await openTextDocument({ content: ["a", "b", "blah1", "blah2"].join("\n") });

        await sendInsertKey();
        await setSelection(new Selection(0, 0, 0, 1));
        await copyVSCodeSelection();

        await setSelection(new Selection(2, 0, 3, 5));
        await pasteVSCode();

        await sendEscapeKey();

        await assertContent(
            {
                content: ["a", "b", "a"],
            },
            client,
        );
    });

    it("Modifying new line with changes before and after", async () => {
        await openTextDocument({ content: ["a", "b"].join("\n") });

        await sendVSCodeKeys("j");
        await sendInsertKey("A");
        await sendVSCodeKeys("1");
        await sendVSCodeSpecialKey("cursorUp");
        await sendVSCodeKeys("1");
        await sendVSCodeKeys("\n");
        await sendVSCodeKeys("test");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["a1", "test", "b1"],
            },
            client,
        );
    });

    it("Removing modified line", async () => {
        await openTextDocument({ content: ["a", "b"].join("\n") });

        await sendInsertKey("A");
        await sendVSCodeKeys("\n");
        await sendVSCodeKeys("a1");

        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");

        await sendEscapeKey();
        await assertContent(
            {
                content: ["a", "b"],
            },
            client,
        );
    });

    it("Doesn't produce ghost changes when inserting large chunk of text", async () => {
        await openTextDocument({ content: ["a", "", "b"].join("\n") });

        await sendVSCodeKeys("j");
        await sendInsertKey("I");
        await sendVSCodeKeys("\n".repeat(50), 0);
        await sendEscapeKey();

        await assertContent(
            {
                content: ["a", ..."\n".repeat(50).split("\n"), "b"],
            },
            client,
        );
    });

    it("Complex change - 1", async () => {
        await openTextDocument({ content: ["1", "2", "3", "4", "5", "6", "7", "8", "9"].join("\n") });

        await sendVSCodeKeys("jji"); // at beginning "3"
        await sendVSCodeSpecialKey("delete");
        await sendVSCodeSpecialKey("delete");
        await sendVSCodeSpecialKey("delete");
        await sendVSCodeSpecialKey("delete");
        await sendVSCodeSpecialKey("delete");
        await sendVSCodeSpecialKey("delete");
        await sendVSCodeKeys("\n");
        await sendVSCodeSpecialKey("cursorUp");
        await sendVSCodeKeys(" 3\n");
        await sendVSCodeKeys("4\n");
        await sendVSCodeKeys("5\n");
        await sendVSCodeKeys("5.1");
        await sendVSCodeSpecialKey("cursorDown"); // at end of 6
        await sendVSCodeKeys("\n6.1\n6.2");
        await sendVSCodeSpecialKey("cursorDown"); // at end of 7 7
        await sendVSCodeSpecialKey("delete");
        await sendVSCodeSpecialKey("delete"); // delete 8
        await sendEscapeKey();

        await assertContent(
            {
                content: ["1", "2", " 3", " 4", " 5", " 5.1", "6", "6.1", "6.2", "7", "9"],
            },
            client,
        );
    });

    it("Moving cursor in insert mode stores cursor position on exit", async () => {
        await openTextDocument({ content: ["blah1 blah2 blah3"].join("\n") });

        await sendInsertKey();
        await sendVSCodeSpecialKey("cursorRight");
        await sendVSCodeSpecialKey("cursorRight");
        await sendVSCodeSpecialKey("cursorRight");
        await sendEscapeKey();

        await assertContent(
            {
                cursor: [0, 2],
            },
            client,
        );
    });

    it("Updates cursor position after exiting insert mode", async () => {
        await openTextDocument({ content: "blah1 blah2 blah3" });

        await sendInsertKey("A");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("4");

        await sendEscapeKey();

        await assertContent(
            {
                cursor: [0, 16],
            },
            client,
        );
    });

    it("Handles keys typed immediately after sending escape key", async () => {
        await openTextDocument({ content: ["blah1 blah2"].join("\n") });

        await sendVSCodeKeys("0ea");
        await sendVSCodeKeys("aaa");

        await Promise.all([sendEscapeKey(), sendVSCodeKeys("$")]);
        await wait(200);
        await assertContent(
            {
                cursor: [0, 13],
                content: ["blah1aaa blah2"],
            },
            client,
        );
    });

    it("Insert mode racing with document changes", async () => {
        await openTextDocument({ content: ["blah1 blah2 blah3"].join("\n") });

        await sendVSCodeKeys("ee");
        await assertContent({ cursor: [0, 10] }, client);
        await sendVSCodeKeysAtomic("ciwtest", 500);

        await assertContent(
            {
                mode: "i",
                content: ["blah1 test blah3"],
                cursor: [0, 10],
            },
            client,
        );
    });

    it("Handles repeating last inserted text", async () => {
        await openTextDocument({ content: "" });

        await sendVSCodeKeys("i1");
        await sendEscapeKey();
        await sendVSCodeKeys("a2");
        await sendEscapeKey();
        await sendVSCodeKeys("a3");
        await sendEscapeKey();
        await sendInsertKey("a");
        await sendVSCodeCommand("vscode-neovim.send", "<C-a>", 500);

        await assertContent(
            {
                content: ["1233"],
            },
            client,
        );
    });

    it("Handles repeating last inserted text in middle of text", async () => {
        await openTextDocument({ content: ["blah1 blah3"].join("\n") });

        await sendVSCodeKeys("ea blah2");
        await sendEscapeKey();
        await sendInsertKey("A");
        await sendVSCodeCommand("vscode-neovim.send", "<C-a>", 500);

        await assertContent(
            {
                content: ["blah1 blah2 blah3 blah2"],
            },
            client,
        );
    });

    it("Handles repeating last inserted text with newline", async () => {
        await openTextDocument({ content: "blah1 blah3" });

        await sendVSCodeKeys("wiblah2\n");
        await sendEscapeKey();
        await sendInsertKey("A");
        await sendVSCodeCommand("vscode-neovim.send", "<C-a>", 500);

        await assertContent(
            {
                content: ["blah1 blah2", "blah3blah2", ""],
            },
            client,
        );
    });
});
