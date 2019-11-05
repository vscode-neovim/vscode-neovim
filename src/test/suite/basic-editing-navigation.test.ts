import { strict as assert } from "assert";

import vscode from "vscode";

import {
    attachTestNvimClient,
    getCurrentBufferName,
    sendVSCodeKeys,
    assertContent,
    sendEscapeKey,
    wait,
    sendVSCodeSpecialKey,
    setSelection,
    copyVSCodeSelection,
    pasteVSCode,
    closeActiveEditor,
} from "../utils";

describe("Basic editing and navigation", () => {
    vscode.window.showInformationMessage("Start basic editing & navigation test");
    const client = attachTestNvimClient();

    it("Normal mode", async () => {
        await wait();
        const doc = await vscode.workspace.openTextDocument({
            content: "1abc\n\n2abc blah\n3abc blah blah\n4abc",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        assert.ok(
            (await getCurrentBufferName(client)).match(/untitled/),
            "Buffer name from vscode uri - contains untitled",
        );

        await assertContent(
            {
                content: ["1abc", "", "2abc blah", "3abc blah blah", "4abc"],
                cursor: [0, 0],
                cursorStyle: "block",
                mode: "n",
            },
            client,
        );

        // simple navigating
        await sendVSCodeKeys("ll");
        await assertContent({ cursor: [0, 2] }, client);

        // simple navigating
        await sendVSCodeKeys("jj");
        await assertContent({ cursor: [2, 2] }, client);

        // delete one symbol
        await sendVSCodeKeys("x");
        await assertContent({ content: ["1abc", "", "2ac blah", "3abc blah blah", "4abc"], cursor: [2, 2] }, client);

        // delete word
        await sendVSCodeKeys("d");
        await assertContent({ mode: "no", cursorStyle: "underline" }, client);

        await sendVSCodeKeys("w");
        await assertContent(
            {
                mode: "n",
                cursor: [2, 2],
                cursorStyle: "block",
                content: ["1abc", "", "2ablah", "3abc blah blah", "4abc"],
            },
            client,
        );

        // empty line but not delete
        await sendVSCodeKeys("0");
        await sendVSCodeKeys("d$");
        await assertContent(
            {
                content: ["1abc", "", "", "3abc blah blah", "4abc"],
                cursor: [2, 0],
                cursorStyle: "block",
            },
            client,
        );

        // delete 2 lines
        await sendVSCodeKeys("dk");
        await assertContent(
            {
                content: ["1abc", "3abc blah blah", "4abc"],
                cursor: [1, 0],
            },
            client,
        );

        await sendVSCodeKeys("O");
        await assertContent(
            {
                content: ["1abc", "", "3abc blah blah", "4abc"],
                cursor: [1, 0],
                mode: "i",
                cursorStyle: "line",
            },
            client,
        );

        await sendEscapeKey();
        await assertContent(
            {
                content: ["1abc", "", "3abc blah blah", "4abc"],
                cursor: [1, 0],
                mode: "n",
                cursorStyle: "block",
            },
            client,
        );

        await sendVSCodeKeys("j");
        await assertContent(
            {
                cursor: [2, 0],
            },
            client,
        );

        // test o, O
        await sendVSCodeKeys("o");
        await wait(500);
        await assertContent(
            {
                content: ["1abc", "", "3abc blah blah", "", "4abc"],
                cursor: [3, 0],
                mode: "i",
                cursorStyle: "line",
            },
            client,
        );
        await sendEscapeKey();
        await sendVSCodeKeys("k");

        await sendVSCodeKeys("O");
        await wait();
        await assertContent(
            {
                content: ["1abc", "", "", "3abc blah blah", "", "4abc"],
                cursor: [2, 0],
                mode: "i",
                cursorStyle: "line",
            },
            client,
        );
        await sendEscapeKey();

        await closeActiveEditor(client);
        assert.ok(!(await getCurrentBufferName(client)).match(/untitled/));
    });

    it("Insert mode", async () => {
        const doc = await vscode.workspace.openTextDocument({});
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await assertContent(
            {
                content: [""],
                cursor: [0, 0],
                cursorStyle: "block",
                mode: "n",
            },
            client,
        );

        // entering insert mode
        await sendVSCodeKeys("i");
        await assertContent(
            {
                cursor: [0, 0],
                mode: "i",
                cursorStyle: "line",
            },
            client,
        );

        // basic editing
        await sendVSCodeKeys("blah");
        await assertContent(
            {
                cursor: [0, 4],
                mode: "i",
                cursorStyle: "line",
                content: ["blah"],
            },
            client,
        );

        // deleting single char
        await sendVSCodeSpecialKey("backspace");
        await assertContent(
            {
                cursor: [0, 3],
                mode: "i",
                cursorStyle: "line",
                content: ["bla"],
            },
            client,
        );

        // insert newline after
        await sendVSCodeKeys("\n");
        await assertContent(
            {
                cursor: [1, 0],
                content: ["bla", ""],
            },
            client,
        );

        // editing newline
        await sendVSCodeKeys("test");
        await assertContent(
            {
                cursor: [1, 4],
                content: ["bla", "test"],
            },
            client,
        );

        // cursor navigation in the insert mode
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");
        await assertContent(
            {
                vsCodeCursor: [1, 0],
                content: ["bla", "test"],
            },
            client,
        );

        // inserting newline before
        await sendVSCodeKeys("\n");
        await assertContent(
            {
                vsCodeCursor: [2, 0],
                content: ["bla", "", "test"],
            },
            client,
        );

        // deleting newline
        await sendVSCodeSpecialKey("backspace");
        await assertContent(
            {
                vsCodeCursor: [1, 0],
                content: ["bla", "test"],
            },
            client,
        );

        // insert newline in the middle of the word
        await sendVSCodeSpecialKey("cursorRight");
        await sendVSCodeKeys("\n");
        await assertContent(
            {
                vsCodeCursor: [2, 0],
                content: ["bla", "t", "est"],
            },
            client,
        );

        // deleting few lines in insert mode by selecting them
        await sendVSCodeKeys("\n");
        await sendVSCodeKeys("\n");
        await assertContent(
            {
                vsCodeCursor: [4, 0],
                content: ["bla", "t", "", "", "est"],
            },
            client,
        );
        setSelection([{ anchorPos: [0, 3], cursorPos: [4, 0] }]);
        await sendVSCodeSpecialKey("backspace");

        await assertContent(
            {
                vsCodeCursor: [0, 3],
                content: ["blaest"],
            },
            client,
        );

        // replacing multiple lines
        // switch to end of line
        await sendVSCodeSpecialKey("cursorRight");
        await sendVSCodeSpecialKey("cursorRight");
        await sendVSCodeSpecialKey("cursorRight");
        await sendVSCodeSpecialKey("cursorRight");

        await sendVSCodeKeys("\nline2\nline3\n\na\nb\nc");
        await assertContent(
            {
                content: ["blaest", "line2", "line3", "", "a", "b", "c"],
            },
            client,
        );
        // copy - lines increased
        setSelection([{ anchorPos: [0, 0], cursorPos: [2, 5] }]);
        await copyVSCodeSelection();
        setSelection([{ anchorPos: [4, 0], cursorPos: [6, 0] }]);
        await pasteVSCode();
        await assertContent(
            {
                vsCodeCursor: [6, 5],
                content: ["blaest", "line2", "line3", "", "blaest", "line2", "line3c"],
            },
            client,
        );

        // copy - lines decreased
        setSelection([{ anchorPos: [1, 0], cursorPos: [3, 0] }]);
        await copyVSCodeSelection();
        setSelection([{ anchorPos: [3, 0], cursorPos: [6, 6] }]);
        await pasteVSCode();
        await assertContent(
            {
                vsCodeCursor: [5, 0],
                content: ["blaest", "line2", "line3", "line2", "line3", ""],
            },
            client,
        );

        // multiline paste into single line
        setSelection([{ anchorPos: [0, 0], cursorPos: [2, 0] }]);
        await copyVSCodeSelection();
        setSelection([{ anchorPos: [2, 0], cursorPos: [2, 0] }]);
        await pasteVSCode();
        await assertContent(
            {
                vsCodeCursor: [4, 0],
                content: ["blaest", "line2", "blaest", "line2", "line3", "line2", "line3", ""],
            },
            client,
        );

        // snippet inserting
        setSelection([{ anchorPos: [7, 0], cursorPos: [7, 0] }]);
        await vscode.window.activeTextEditor!.insertSnippet(new vscode.SnippetString("while ($1) {\n$2\n}"));
        await wait();
        await assertContent(
            {
                vsCodeCursor: [7, 7],
                content: ["blaest", "line2", "blaest", "line2", "line3", "line2", "line3", "while () {", "", "}"],
            },
            client,
        );
        await sendEscapeKey();
        // sets cursor on neovim after exiting insert mode
        await assertContent(
            {
                cursor: [7, 7],
            },
            client,
        );
        await closeActiveEditor(client);
    });

    it("Keys changing mode to the insert mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "1abc",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

        await assertContent(
            {
                content: ["1abc"],
                cursor: [0, 0],
                cursorStyle: "block",
                mode: "n",
            },
            client,
        );
        await sendVSCodeKeys("A");
        await assertContent(
            {
                cursor: [0, 4],
                cursorStyle: "line",
                mode: "i",
            },
            client,
        );

        await sendEscapeKey();
        await sendVSCodeKeys("I");
        await assertContent(
            {
                cursor: [0, 0],
                cursorStyle: "line",
                mode: "i",
            },
            client,
        );

        await sendEscapeKey();
        await sendVSCodeKeys("O");
        await assertContent(
            {
                cursor: [0, 0],
                cursorStyle: "line",
                mode: "i",
                content: ["", "1abc"],
            },
            client,
        );

        await sendEscapeKey();
        await sendVSCodeKeys("o");
        await assertContent(
            {
                cursor: [1, 0],
                cursorStyle: "line",
                mode: "i",
                content: ["", "", "1abc"],
            },
            client,
        );
        await closeActiveEditor(client);
    });
});
