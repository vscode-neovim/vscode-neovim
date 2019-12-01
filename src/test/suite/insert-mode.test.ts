import vscode from "vscode";
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
} from "../utils";

describe.only("Insert mode and buffer syncronization", () => {
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

    it("Line change", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "blah\nblah2",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("ll");
        await sendVSCodeKeys("i");
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
        const doc = await vscode.workspace.openTextDocument({
            content: "blah\nblah2",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("i");
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["blah1", "", "", "blah2", "", "", "", "blah3"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("jjji");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah1", "blah2", "", "", "", "blah3"],
            },
            client,
        );

        await sendVSCodeKeys("jjjji");
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["blah1", "", "", "blah2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("A");
        await sendVSCodeSpecialKey("delete");
        await sendVSCodeSpecialKey("delete");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah1", "blah2"],
            },
            client,
        );
        await sendVSCodeKeys("a");
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["blah1", "", "blah2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("ji");
        await vscode.window.activeTextEditor!.insertSnippet(new vscode.SnippetString("while ($1) {\n$2\n}"));
        await wait();
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["blah1", "", "", "blah2", "", "blah3"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        // go to end of blah2
        await sendVSCodeKeys("jjj");
        await sendVSCodeKeys("A", 1000);
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["blah1", "", "", "blah2", "", "blah3"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("jjj");
        await sendVSCodeKeys("A", 1000);
        await sendVSCodeKeys("test");

        setSelection([{ anchorPos: [0, 0], cursorPos: [3, 0] }]);
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["a", "b", "blah1", "blah2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("i", 1000);
        setSelection([{ anchorPos: [0, 0], cursorPos: [1, 1] }]);
        await copyVSCodeSelection();

        setSelection([{ anchorPos: [2, 0], cursorPos: [4, 0] }]);
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["a", "b", "blah1", "blah2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("i");
        setSelection([{ anchorPos: [0, 0], cursorPos: [1, 1] }]);
        await copyVSCodeSelection();

        setSelection([{ anchorPos: [2, 0], cursorPos: [2, 5] }]);
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["a", "b", "blah1", "blah2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("i");
        setSelection([{ anchorPos: [0, 0], cursorPos: [0, 1] }]);
        await copyVSCodeSelection();

        setSelection([{ anchorPos: [2, 0], cursorPos: [3, 5] }]);
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["a", "b"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("j");
        await sendVSCodeKeys("A");
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["a", "b"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("A");
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
        const doc = await vscode.workspace.openTextDocument({
            content: ["a", "", "b"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("j", 500);
        await sendVSCodeKeys("I", 1000);
        await sendVSCodeKeys("\n".repeat(50));
        await sendEscapeKey(1000);

        await assertContent(
            {
                content: ["a", ..."\n".repeat(50).split("\n"), "b"],
            },
            client,
        );
    });
});
