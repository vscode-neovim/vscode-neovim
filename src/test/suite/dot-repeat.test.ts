import { NeovimClient } from "neovim";
import { Selection } from "vscode";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    sendVSCodeKeys,
    sendEscapeKey,
    assertContent,
    sendVSCodeSpecialKey,
    pasteVSCode,
    setSelection,
    copyVSCodeSelection,
    openTextDocument,
    sendInsertKey,
    sendVSCodeKeysAtomic,
} from "../integrationUtils";

describe("Dot-repeat", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Adding - simple", async () => {
        await openTextDocument({ content: "abc" });

        await sendInsertKey("I");
        await sendVSCodeKeys("123");
        await sendEscapeKey();

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["123123abc"],
            },
            client,
        );
    });

    it("Adding - with newline", async () => {
        await openTextDocument({ content: "abc" });

        await sendInsertKey("A");
        await sendVSCodeKeys("12\n3");
        await sendEscapeKey();
        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["abc12", "312", "3"],
            },
            client,
        );
    });

    it("Adding - after newline", async () => {
        await openTextDocument({ content: "abc" });

        await sendInsertKey("A");
        await sendVSCodeKeys("\n123");
        await sendEscapeKey();
        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["abc", "123", "123"],
            },
            client,
        );
    });

    it("Adding and deleting", async () => {
        await openTextDocument({ content: "abc" });

        await sendInsertKey("A");
        await sendVSCodeKeys("123");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["abc11"],
            },
            client,
        );
    });

    it("Entering special keycodes", async () => {
        const originalContent = "abc";
        await openTextDocument({ content: originalContent });

        await sendInsertKey("A");
        const textToType = "<BS><Cmd><LT><BS><BS><Right><Return>hello<Enter>";
        for (const char of textToType) {
            await sendVSCodeKeysAtomic(char, 50);
        }
        await sendEscapeKey();
        await sendVSCodeKeys(".");
        await assertContent(
            {
                content: [`${originalContent}${textToType.repeat(2)}`],
            },
            client,
        );
    });

    it("Deleting", async () => {
        await openTextDocument({ content: "abcabc" });

        await sendInsertKey("A");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["ab"],
            },
            client,
        );
    });

    it("Deleting - full change", async () => {
        await openTextDocument({ content: "abc" });

        await sendInsertKey("A");
        await sendVSCodeKeys("123");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["abc"],
            },
            client,
        );
    });

    it("Deleting - with newline", async () => {
        await openTextDocument({ content: ["1abc", "2abc", "3abc"].join("\n") });

        await sendVSCodeKeys("jjli");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["1abcbabc"],
            },
            client,
        );
    });

    it("Paste", async () => {
        await openTextDocument({ content: "abc" });
        await sendInsertKey("I");
        await setSelection(new Selection(0, 0, 0, 3));
        await copyVSCodeSelection();

        await setSelection(new Selection(0, 3, 0, 3));
        await pasteVSCode();
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["ababcab"],
            },
            client,
        );
    });

    it("Multiline paste", async () => {
        await openTextDocument({ content: ["1abc", "2abc"].join("\n") });
        await sendInsertKey("I");
        await setSelection(new Selection(0, 0, 1, 4));
        await copyVSCodeSelection();

        await setSelection(new Selection(1, 4, 1, 4));
        await pasteVSCode();
        await sendVSCodeSpecialKey("backspace");
        await sendEscapeKey();
        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["1abc", "2abc1abc", "1abc", "2ab2ab"],
            },
            client,
        );
    });

    it("O and o", async () => {
        await openTextDocument({ content: ["test1", "test2", "test3"].join("\n") });
        await sendVSCodeKeys("jl");
        await sendInsertKey("o");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();

        await sendVSCodeKeys("0ggll");
        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1", "blah", "test2", "blah", "test3"],
            },
            client,
        );

        await sendVSCodeKeys("0ggj");
        await sendInsertKey("O", 500); // delay to fix flaky test
        await sendVSCodeKeys("blah2");
        await sendEscapeKey();

        await sendVSCodeKeys("0ggll");
        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["blah2", "test1", "blah2", "blah", "test2", "blah", "test3"],
            },
            client,
        );
    });

    it("inew word inside line", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0ll");
        await sendInsertKey("i");
        await sendVSCodeKeys("new word");
        await sendEscapeKey();
        await sendVSCodeKeys("0jll");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["tenew wordst1", "tenew wordst2"],
            },
            client,
        );
    });

    it("Single brackets", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A(");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1()", "test2()"],
            },
            client,
        );
    });

    it("Brackets with a text inside", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A(blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1(blah)", "test2(blah)"],
            },
            client,
        );
    });

    it("Inner brackets", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A(blah{blah2");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1(blah{blah2})", "test2(blah{blah2})"],
            },
            client,
        );
    });

    it("Inner brackets 2", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A((blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1((blah))", "test2((blah))"],
            },
            client,
        );
    });

    it("Inner brackets 3", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A({blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1({blah})", "test2({blah})"],
            },
            client,
        );
    });

    it("Deleting single brackets - 1", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A(");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1blah", "test2blah"],
            },
            client,
        );
    });

    it("Deleting single brackets - 2", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A(ab");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1blah", "test2blah"],
            },
            client,
        );
    });

    it("Deleting inner brackets - 1", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A({");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1blah", "test2blah"],
            },
            client,
        );
    });

    it("Deleting inner brackets - 2", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A({ab");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1blah", "test2blah"],
            },
            client,
        );
    });

    it("Deleting inner brackets - 3", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A(ab{c");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1(abblah)", "test2(abblah)"],
            },
            client,
        );
    });

    it("Deleting inner brackets - 4", async () => {
        await openTextDocument({ content: ["test1", "test2"].join("\n") });

        await sendVSCodeKeys("gg0A(ab{c");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("0j");

        await sendVSCodeKeys(".", 300);
        await assertContent(
            {
                content: ["test1blah", "test2blah"],
            },
            client,
        );
    });

    it("With o and undo", async () => {
        await openTextDocument({ content: ["test1", "test2", "test3"].join("\n") });

        await sendInsertKey("o");
        await sendVSCodeKeys("\n\n\n");
        await sendEscapeKey();

        await sendVSCodeKeys("j.");
        await assertContent(
            {
                content: ["test1", "", "", "", "", "test2", "", "", "", "", "test3"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["test1", "", "", "", "", "test2", "test3"],
            },
            client,
        );

        await sendVSCodeKeys("u");
        await assertContent(
            {
                content: ["test1", "test2", "test3"],
            },
            client,
        );
    });
    it("Deleting before adding #1580", async () => {
        await openTextDocument({ content: ["aaaaaa", "bbbbbb"].join("\n") });
        await sendVSCodeKeys("ggA");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeSpecialKey("backspace");
        await sendVSCodeKeys("123");
        await sendEscapeKey();
        await sendVSCodeKeys("j$.");
        await assertContent(
            {
                content: ["aaa123", "bbb123"],
            },
            client,
        );
    });
});
