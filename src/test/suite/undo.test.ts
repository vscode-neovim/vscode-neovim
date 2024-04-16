import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    assertContent,
    wait,
    sendEscapeKey,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendInsertKey,
} from "../integrationUtils";

describe("Undo", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("U in new buffer doesnt undo initial content", async () => {
        await openTextDocument({ content: "some line\notherline" });
        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["some line", "otherline"],
            },
            client,
        );
    });

    it("Undo points are correct after the insert mode", async () => {
        await openTextDocument({ content: "some line\notherline" });
        // for some reason sending both jA fails
        await sendVSCodeKeys("j");
        await sendInsertKey("A");
        await sendVSCodeKeys("\nblah");
        await sendEscapeKey();

        await sendInsertKey("A");
        await sendVSCodeKeys("\nblah");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["some line", "otherline", "blah", "blah"],
            },
            client,
        );

        await sendVSCodeKeys("u", 500);
        await assertContent(
            {
                content: ["some line", "otherline", "blah"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["some line", "otherline"],
            },
            client,
        );
    });

    it("Undo points are correct after newlines", async () => {
        await openTextDocument({ content: "some line\notherline" });
        await sendVSCodeKeys("jo");
        await sendVSCodeKeys("blah\nblah");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["some line", "otherline", "blah", "blah"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["some line", "otherline"],
            },
            client,
        );
    });

    it("Undo points are correct after newlines - 2", async () => {
        await openTextDocument({ content: "" });
        await sendInsertKey();
        await sendVSCodeKeys("blah\notherblah");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["blah", "otherblah"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: [""],
            },
            client,
        );
    });

    it("Buffer is ok after undo and o", async () => {
        await openTextDocument({ content: "a\nb" });
        await sendVSCodeKeys("yy");
        await sendVSCodeKeys("p");
        await sendVSCodeKeys("u");
        await sendInsertKey("o");

        await sendEscapeKey();
        await assertContent(
            {
                content: ["a", "", "b"],
                cursor: [1, 0],
            },
            client,
        );
        await sendVSCodeKeys("itest");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["a", "test", "b"],
            },
            client,
        );
        await sendVSCodeKeys("dd");
        await assertContent(
            {
                content: ["a", "b"],
            },
            client,
        );
    });

    it("Buffer ok after undo - 2", async () => {
        await openTextDocument({ content: "" });

        await sendVSCodeKeys("ia\nb\n\nc");
        await sendEscapeKey();

        await assertContent(
            {
                content: ["a", "b", "", "c"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: [""],
            },
            client,
        );
    });

    it("Undo after switching tabs", async () => {
        const doc1 = await vscode.workspace.openTextDocument({
            content: ["1"].join("\n"),
        });
        const doc2 = await vscode.workspace.openTextDocument({
            content: ["2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc1, vscode.ViewColumn.One);
        await wait(500);
        await vscode.window.showTextDocument(doc2, vscode.ViewColumn.One);
        await wait(500);
        await assertContent({ content: ["2"] }, client);
        await sendInsertKey("A");
        await sendVSCodeKeys("test");
        await sendEscapeKey();
        await assertContent({ content: ["2test"] }, client);
        await sendVSCodeKeys("gT");
        await sendVSCodeKeys("gt");
        await wait(500);
        await sendVSCodeKeys("u");
        await assertContent({ content: ["2"] }, client);
    });
});
