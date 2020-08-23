import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    wait,
    sendVSCodeKeys,
    sendEscapeKey,
    assertContent,
    sendVSCodeSpecialKey,
    pasteVSCode,
    setSelection,
    copyVSCodeSelection,
} from "../utils";

describe("Dot-repeat", () => {
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

    it("Adding - simple", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "abc",
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("I");
        await sendVSCodeKeys("123");
        await sendEscapeKey();

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["123123abc"],
            },
            client,
        );
    });

    it("Adding - with newline", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "abc",
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("A");
        await sendVSCodeKeys("12\n3");
        await sendEscapeKey();
        await sendVSCodeKeys(".");

        await assertContent(
            {
                content: ["abc12", "312", "3"],
            },
            client,
        );
    });

    it("Adding - after newline", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "abc",
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("A");
        await sendVSCodeKeys("\n123");
        await sendEscapeKey();
        await sendVSCodeKeys(".");

        await assertContent(
            {
                content: ["abc", "123", "123"],
            },
            client,
        );
    });

    it("Adding and deleting", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "abc",
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("A");
        await sendVSCodeKeys("123");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".");

        await assertContent(
            {
                content: ["abc11"],
            },
            client,
        );
    });

    it("Deleting", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "abcabc",
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("A");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".");

        await assertContent(
            {
                content: ["ab"],
            },
            client,
        );
    });

    it("Deleting - full change", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "abc",
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("A");
        await sendVSCodeKeys("123");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".");

        await assertContent(
            {
                content: ["abc"],
            },
            client,
        );
    });

    it("Deleting - with newline", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["1abc", "2abc", "3abc"].join("\n"),
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("jjli");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".");

        await assertContent(
            {
                content: ["1abcbabc"],
            },
            client,
        );
    });

    it("Paste", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: "abc",
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);
        await sendVSCodeKeys("I");
        await setSelection([{ anchorPos: [0, 0], cursorPos: [0, 3] }]);
        await copyVSCodeSelection();

        await setSelection([{ anchorPos: [0, 3], cursorPos: [0, 3] }]);
        await pasteVSCode();
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".");

        await assertContent(
            {
                content: ["ababcab"],
            },
            client,
        );
    });

    it("Multiline paste", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["1abc", "2abc"].join("\n"),
        });

        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);
        await sendVSCodeKeys("I");
        await setSelection([{ anchorPos: [0, 0], cursorPos: [1, 4] }]);
        await copyVSCodeSelection();

        await setSelection([{ anchorPos: [1, 4], cursorPos: [1, 4] }]);
        await pasteVSCode();
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".");

        await assertContent(
            {
                content: ["1abc", "2abc1abc", "1abc", "2ab2ab"],
            },
            client,
        );
    });

    it("O and o", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2", "test3"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);
        await sendVSCodeKeys("jl");
        await sendVSCodeKeys("o");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();

        await sendVSCodeKeys("0ggll");
        await sendVSCodeKeys(".");

        await assertContent(
            {
                content: ["test1", "blah", "test2", "blah", "test3"],
            },
            client,
        );

        await sendVSCodeKeys("0ggjO");
        await sendVSCodeKeys("blah2");
        await sendEscapeKey();

        await sendVSCodeKeys("0ggll");
        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["blah2", "test1", "blah2", "blah", "test2", "blah", "test3"],
            },
            client,
        );
    });

    it("inew word inside line", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0ll");
        await sendVSCodeKeys("inew word");
        await sendEscapeKey();
        await sendVSCodeKeys("0jll");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["tenew wordst1", "tenew wordst2"],
            },
            client,
        );
    });

    it("Single brackets", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A(");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1()", "test2()"],
            },
            client,
        );
    });

    it("Brackets with a text inside", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A(blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1(blah)", "test2(blah)"],
            },
            client,
        );
    });

    it("Inner brackets", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A(blah{blah2");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1(blah{blah2})", "test2(blah{blah2})"],
            },
            client,
        );
    });

    it("Inner brackets 2", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A((blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1((blah))", "test2((blah))"],
            },
            client,
        );
    });

    it("Inner brackets 3", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A({blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1({blah})", "test2({blah})"],
            },
            client,
        );
    });

    it("Deleting single brackets - 1", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A(");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1blah", "test2blah"],
            },
            client,
        );
    });

    it("Deleting single brackets - 2", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A(ab");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1blah", "test2blah"],
            },
            client,
        );
    });

    it("Deleting inner brackets - 1", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A({");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1blah", "test2blah"],
            },
            client,
        );
    });

    it("Deleting inner brackets - 2", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A({ab");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1blah", "test2blah"],
            },
            client,
        );
    });

    it("Deleting inner brackets - 3", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A(ab{c");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1(abblah)", "test2(abblah)"],
            },
            client,
        );
    });

    it("Deleting inner brackets - 4", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test1", "test2"].join("\n"),
        });
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(1000);

        await sendVSCodeKeys("gg0A(ab{c");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: ["test1blah", "test2blah"],
            },
            client,
        );
    });
});
