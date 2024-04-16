import { strict as assert } from "assert";

import { NeovimClient } from "neovim";
import { EndOfLine } from "vscode";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    assertContent,
    sendEscapeKey,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendInsertKey,
} from "../integrationUtils";

describe("Basic editing and navigation", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Normal mode", async () => {
        await openTextDocument({ content: ["1abc", "", "2abc blah", "3abc blah blah", "4abc"].join("\n") });

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

        await sendInsertKey("O");
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
        await sendInsertKey("o");
        await sendEscapeKey();
        await assertContent(
            {
                content: ["1abc", "", "3abc blah blah", "", "4abc"],
                cursor: [3, 0],
                mode: "n",
            },
            client,
        );
        await sendVSCodeKeys("k");

        await sendInsertKey("O");
        await sendEscapeKey();
        await assertContent(
            {
                content: ["1abc", "", "", "3abc blah blah", "", "4abc"],
                cursor: [2, 0],
                mode: "n",
            },
            client,
        );
    });

    it("Editing last line doesnt insert new line in vscode", async () => {
        await openTextDocument({ content: "1abc\n2abc" });

        await sendVSCodeKeys("jllx");
        await assertContent(
            {
                content: ["1abc", "2ac"],
                cursor: [1, 2],
            },
            client,
        );
    });

    it("Keys changing mode to the insert mode", async () => {
        await openTextDocument({ content: "1abc" });

        await assertContent(
            {
                content: ["1abc"],
                cursor: [0, 0],
                cursorStyle: "block",
                mode: "n",
            },
            client,
        );
        await sendInsertKey("A");
        await assertContent(
            {
                cursor: [0, 4],
                cursorStyle: "line",
                mode: "i",
            },
            client,
        );

        await sendEscapeKey();
        await sendInsertKey("I");
        await assertContent(
            {
                cursor: [0, 0],
                cursorStyle: "line",
                mode: "i",
            },
            client,
        );

        await sendEscapeKey();
        await sendInsertKey("O");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [0, 0],
                content: ["", "1abc"],
            },
            client,
        );

        await sendInsertKey("o");
        await sendEscapeKey();
        await assertContent(
            {
                cursor: [1, 0],
                content: ["", "", "1abc"],
            },
            client,
        );
    });

    it("Shift-A/Shift-I", async () => {
        await openTextDocument({
            content: ["message ChatEntryNoteData {", "    // Note", "    string note = 1;", "},"].join("\n"),
        });

        await assertContent(
            {
                content: ["message ChatEntryNoteData {", "    // Note", "    string note = 1;", "},"],
                cursor: [0, 0],
                cursorStyle: "block",
                mode: "n",
            },
            client,
        );
        await sendVSCodeKeys("j7l");
        await assertContent({ cursor: [1, 7] }, client);
        await sendInsertKey("A");
        await assertContent({ cursor: [1, 11], mode: "i" }, client);
        await sendEscapeKey();
        await sendVSCodeKeys("gg0j7l");
        await sendInsertKey("I");
        await assertContent({ cursor: [1, 4], mode: "i" }, client);

        await sendEscapeKey();
        await sendVSCodeKeys("gg0j4l");
        await sendInsertKey("A");
        await assertContent({ cursor: [1, 11], mode: "i" }, client);
    });

    it("Ci-ca-etc...", async () => {
        await openTextDocument({
            content: [
                "text (first) text",
                "text (second) text",
                "text 'third' text",
                "text { text",
                "text block text",
                "text } text",
                "text { text",
                "text block2 text",
                "text } text",
                "end",
            ].join("\n"),
        });
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
        await sendVSCodeKeys("j08lca(");
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
        await sendVSCodeKeys("jjj6lca{", 500);
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
        await sendVSCodeKeys("j07lci{");
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

    it("Cursor is ok after deleting the line", async () => {
        await openTextDocument({ content: ["a", "{", "    b", "    c", "}"].join("\n") });

        await sendVSCodeKeys("jj$");
        await sendVSCodeKeys("dd");
        await assertContent(
            {
                cursor: [2, 4],
            },
            client,
        );
    });

    it("Cursor pos in large files - 1", async () => {
        await openTextDocument({ content: ["test"].join("\n") });

        await sendVSCodeKeys("yy210p");

        await sendVSCodeKeys("G");
        await assertContent(
            {
                cursor: [210, 0],
            },
            client,
        );

        await sendVSCodeKeys("gg");
        await assertContent(
            {
                cursor: [0, 0],
            },
            client,
        );
    });

    it("Cursor pos in large files - 2", async () => {
        await openTextDocument({ content: ["test"].join("\n") });

        await sendVSCodeKeys("yy800p");

        await sendVSCodeKeys("G", 500);
        await assertContent(
            {
                cursor: [800, 0],
            },
            client,
        );
        await sendVSCodeKeys("k");
        await assertContent(
            {
                cursor: [799, 0],
            },
            client,
        );
        await sendVSCodeKeys("j");
        await assertContent(
            {
                cursor: [800, 0],
            },
            client,
        );

        await sendVSCodeKeys("gg", 500);
        await assertContent(
            {
                cursor: [0, 0],
            },
            client,
        );
    });

    it("Navigating with tab indents", async () => {
        await openTextDocument({ content: ["\t\tte\tst"].join("\n") });

        await sendVSCodeKeys("gg0");
        await sendVSCodeKeys("l");
        await assertContent(
            {
                cursor: [0, 1],
            },
            client,
        );

        await sendVSCodeKeys("x");
        await assertContent(
            {
                content: ["\tte\tst"],
                cursor: [0, 1],
            },
            client,
        );

        await sendVSCodeKeys("lx");
        await assertContent(
            {
                content: ["\tt\tst"],
                cursor: [0, 2],
            },
            client,
        );

        await sendVSCodeKeys("llx");
        await assertContent(
            {
                content: ["\tt\ts"],
                cursor: [0, 3],
            },
            client,
        );
    });

    it("Insert mode changes seen by neovim", async () => {
        await openTextDocument({ content: "" });

        await sendVSCodeKeys("iaaaaa");
        await sendEscapeKey();
        await sendVSCodeKeys("0A");
        await assertContent(
            {
                content: ["aaaaa"],
                cursor: [0, 5],
            },
            client,
        );
    });

    it("handles CRLF consistently #1618", async () => {
        const editor = await openTextDocument({ content: ["a", " a", "", "a"].join("\r\n") });
        assert.ok(editor.document.eol === EndOfLine.CRLF);
        await sendVSCodeKeys("jo");
        await sendEscapeKey();
        await assertContent(
            {
                content: ["a", " a", "", "", "a"],
            },
            client,
        );
        assert.ok(editor.document.eol === EndOfLine.CRLF);
    });
});
