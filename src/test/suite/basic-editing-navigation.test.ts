import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    assertContent,
    sendEscapeKey,
    wait,
    closeAllActiveEditors,
    closeNvimClient,
} from "../utils";

describe("Basic editing and navigation", () => {
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

    it("Normal mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["1abc", "", "2abc blah", "3abc blah blah", "4abc"].join("\n"),
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
