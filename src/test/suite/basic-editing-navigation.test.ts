import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    assertContent,
    sendEscapeKey,
    wait,
    sendVSCodeSpecialKey,
    setSelection,
    copyVSCodeSelection,
    pasteVSCode,
    closeAllActiveEditors,
} from "../utils";

describe("Basic editing and navigation", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        client.quit();
    });

    afterEach(async () => {
        await closeAllActiveEditors();
    });

    it("Normal mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "1abc\n\n2abc blah\n3abc blah blah\n4abc",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

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
        await wait(1000);
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
        await wait(1000);
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
    });

    it("Editing last line doesnt insert new line in vscode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "1abc\n2abc",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("jllx");
        await assertContent(
            {
                content: ["1abc", "2ac"],
                cursor: [1, 2],
            },
            client,
        );
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
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [0, 3],
                content: ["blah"],
            },
            client,
        );

        // deleting single char
        await sendVSCodeKeys("a");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [0, 2],
                content: ["bla"],
            },
            client,
        );

        // insert newline after
        await sendVSCodeKeys("a");
        await sendVSCodeKeys("\n");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [1, 0],
                content: ["bla", ""],
            },
            client,
        );

        // editing newline
        await sendVSCodeKeys("a");
        await sendVSCodeKeys("test");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [1, 3],
                content: ["bla", "test"],
            },
            client,
        );

        // cursor navigation in the insert mode
        await sendVSCodeKeys("a");
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [1, 0],
                content: ["bla", "test"],
            },
            client,
        );

        // inserting newline before
        await sendVSCodeKeys("i");
        await sendVSCodeKeys("\n");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [2, 0],
                content: ["bla", "", "test"],
            },
            client,
        );

        // deleting newline
        await sendVSCodeKeys("i");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [1, 0],
                content: ["bla", "test"],
            },
            client,
        );

        // insert newline in the middle of the word
        await sendVSCodeKeys("i");
        await sendVSCodeSpecialKey("cursorRight");
        await sendVSCodeKeys("\n");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [2, 0],
                content: ["bla", "t", "est"],
            },
            client,
        );

        // deleting few lines in insert mode by selecting them
        await sendVSCodeKeys("i");
        await sendVSCodeKeys("\n");
        await sendVSCodeKeys("\n");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [4, 0],
                content: ["bla", "t", "", "", "est"],
            },
            client,
        );

        await sendVSCodeKeys("i");
        setSelection([{ anchorPos: [0, 3], cursorPos: [4, 0] }]);
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();

        await assertContent(
            {
                cursor: [0, 2],
                content: ["blaest"],
            },
            client,
        );

        // replacing multiple lines
        // switch to end of line
        await sendVSCodeKeys("a");
        await sendVSCodeSpecialKey("cursorRight");
        await sendVSCodeSpecialKey("cursorRight");
        await sendVSCodeSpecialKey("cursorRight");
        await sendVSCodeSpecialKey("cursorRight");

        await sendVSCodeKeys("\nline2\nline3\n\na\nb\nc");
        await sendEscapeKey();
        await assertContent(
            {
                content: ["blaest", "line2", "line3", "", "a", "b", "c"],
            },
            client,
        );
        // copy - lines increased
        await sendVSCodeKeys("i");
        setSelection([{ anchorPos: [0, 0], cursorPos: [2, 5] }]);
        await copyVSCodeSelection();
        setSelection([{ anchorPos: [4, 0], cursorPos: [6, 0] }]);
        await pasteVSCode();
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [6, 4],
                content: ["blaest", "line2", "line3", "", "blaest", "line2", "line3c"],
            },
            client,
        );

        // copy - lines decreased
        await sendVSCodeKeys("i");
        setSelection([{ anchorPos: [1, 0], cursorPos: [3, 0] }]);
        await copyVSCodeSelection();
        setSelection([{ anchorPos: [3, 0], cursorPos: [6, 6] }]);
        await pasteVSCode();
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [5, 0],
                content: ["blaest", "line2", "line3", "line2", "line3", ""],
            },
            client,
        );

        // multiline paste into single line
        await sendVSCodeKeys("i");
        setSelection([{ anchorPos: [0, 0], cursorPos: [2, 0] }]);
        await copyVSCodeSelection();
        setSelection([{ anchorPos: [2, 0], cursorPos: [2, 0] }]);
        await pasteVSCode();
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [4, 0],
                content: ["blaest", "line2", "blaest", "line2", "line3", "line2", "line3", ""],
            },
            client,
        );

        // snippet inserting
        await sendVSCodeKeys("i");
        setSelection([{ anchorPos: [7, 0], cursorPos: [7, 0] }]);
        await vscode.window.activeTextEditor!.insertSnippet(new vscode.SnippetString("while ($1) {\n$2\n}"));
        await wait();
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [7, 6],
                content: ["blaest", "line2", "blaest", "line2", "line3", "line2", "line3", "while () {", "", "}"],
            },
            client,
        );
        await sendEscapeKey(500);
        // sets cursor on neovim after exiting insert mode
        await assertContent(
            {
                cursor: [7, 6],
            },
            client,
        );
    });

    it("Mutliline edits in insert mode", async () => {
        const doc = await vscode.workspace.openTextDocument({});
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

        await sendVSCodeKeys("i");
        await sendVSCodeKeys("first\nsecond\nthird");
        // delete "d" in third
        await sendVSCodeSpecialKey("backspace");
        // move to th
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");
        // delete "i"
        await sendVSCodeSpecialKey("delete");
        // move to "second" line
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");
        await sendVSCodeSpecialKey("cursorLeft");

        // remove line 2 completely
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");

        await sendEscapeKey();

        await assertContent(
            {
                content: ["first", "thr"],
                cursor: [0, 4],
            },
            client,
        );
    });

    it("Keys changing mode to the insert mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "1abc",
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();

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
        await wait(1000);
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
        await wait(1000);
        await assertContent(
            {
                cursor: [1, 0],
                cursorStyle: "line",
                mode: "i",
                content: ["", "", "1abc"],
            },
            client,
        );
    });

    it("Ci-ca-etc...", async () => {
        const doc = await vscode.workspace.openTextDocument({
            // adding "end" to the end of doc because of newline bug. Pretty minor
            content:
                "text (first) text\ntext (second) text\ntext 'third' text\ntext { text\ntext block text\ntext } text\ntext { text\ntext block2 text\ntext } text\nend",
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait();
        await sendVSCodeKeys("6lci(");
        await assertContent(
            {
                vsCodeCursor: [0, 6],
                cursorStyle: "line",
                mode: "i",
                content: [
                    "text () text",
                    "text (second) text",
                    "text 'third' text",
                    "text { text",
                    "text block text",
                    "text } text",
                    "text { text",
                    "text block2 text",
                    "text } text",
                    "end",
                ],
            },
            client,
        );

        await sendEscapeKey();
        await sendVSCodeKeys("j06lca(");
        await assertContent(
            {
                vsCodeCursor: [1, 5],
                cursorStyle: "line",
                mode: "i",
                content: [
                    "text () text",
                    "text  text",
                    "text 'third' text",
                    "text { text",
                    "text block text",
                    "text } text",
                    "text { text",
                    "text block2 text",
                    "text } text",
                    "end",
                ],
            },
            client,
        );

        await sendEscapeKey();
        await sendVSCodeKeys("jjj6lca{");
        await assertContent(
            {
                vsCodeCursor: [3, 5],
                cursorStyle: "line",
                mode: "i",
                content: [
                    "text () text",
                    "text  text",
                    "text 'third' text",
                    "text  text",
                    "text { text",
                    "text block2 text",
                    "text } text",
                    "end",
                ],
            },
            client,
        );

        await sendEscapeKey();
        await sendVSCodeKeys("j07lci{", 300);
        await assertContent(
            {
                vsCodeCursor: [4, 6],
                cursorStyle: "line",
                mode: "i",
                content: ["text () text", "text  text", "text 'third' text", "text  text", "text {} text", "end"],
            },
            client,
        );
    });
});
