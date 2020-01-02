import { NeovimClient } from "neovim";
import vscode from "vscode";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    wait,
    sendVSCodeKeys,
    assertContent,
    sendEscapeKey,
    sendVSCodeSpecialKey,
} from "../utils";

describe("Macros", () => {
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

    it("Macros works", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["a1", "b2", "c3"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys("qa");
        await sendVSCodeKeys("0xj");
        await sendVSCodeKeys("q");

        await assertContent(
            {
                content: ["1", "b2", "c3"],
            },
            client,
        );

        await sendVSCodeKeys("2@a");
        await assertContent(
            {
                content: ["1", "2", "3"],
            },
            client,
        );
    });

    it("Macros with insert mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["a", "b", "c"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys("qa");
        await sendVSCodeKeys("A1");
        await sendEscapeKey();
        await sendVSCodeKeys("j");
        await sendVSCodeKeys("q");

        await assertContent(
            {
                content: ["a1", "b", "c"],
            },
            client,
        );

        await sendVSCodeKeys("2@a");
        await assertContent(
            {
                content: ["a1", "b1", "c1"],
            },
            client,
        );
    });

    it("Cursor is ok while recording macro in insert mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["a", "b", "c"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys("qa");
        await sendVSCodeKeys("A");
        await sendVSCodeKeys("123");

        await assertContent(
            {
                vsCodeCursor: [0, 4],
            },
            client,
        );
        await sendEscapeKey();
        await sendVSCodeKeys("q");
    });

    it("Insert mode is ok after exiting macro insert mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["a", "b", "c"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait();
        await sendVSCodeKeys("qb");
        await sendVSCodeKeys("A");
        await sendVSCodeKeys("1");

        await sendEscapeKey();
        await sendVSCodeKeys("q");

        await sendVSCodeKeys("o", 1000);
        await sendVSCodeKeys("t");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await assertContent(
            {
                content: ["a1", "b", "c"],
                cursor: [0, 1],
            },
            client,
        );
    });
});
