import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    sendVSCodeKeys,
    assertContent,
    sendEscapeKey,
    sendVSCodeSpecialKey,
    openTextDocument,
    sendInsertKey,
} from "../integrationUtils";

describe("Macros", () => {
    let client: NeovimClient;

    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Macros work", async () => {
        await openTextDocument({ content: ["a1", "b2", "c3"].join("\n") });

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
        await openTextDocument({ content: ["a", "b", "c"].join("\n") });

        await sendVSCodeKeys("qa");
        await sendInsertKey("A");
        await sendVSCodeKeys("1");
        await sendEscapeKey();
        await sendVSCodeKeys("j");
        await sendVSCodeKeys("q");
        await assertContent(
            {
                content: ["a1", "b", "c"],
            },
            client,
        );

        await sendVSCodeKeys("2@a", 500);
        await assertContent(
            {
                content: ["a1", "b1", "c1"],
            },
            client,
        );
    });

    it("Cursor is ok while recording macro in insert mode", async () => {
        await openTextDocument({ content: ["a", "b", "c"].join("\n") });

        await sendVSCodeKeys("qa");
        await sendInsertKey("A");
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
        await openTextDocument({ content: ["a", "b", "c"].join("\n") });
        await sendVSCodeKeys("qb");
        await sendInsertKey("A");
        await sendVSCodeKeys("1");

        await sendEscapeKey();
        await sendVSCodeKeys("q");

        await sendInsertKey("o");
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

    it("Macros with o/O", async function () {
        this.retries(2);

        await openTextDocument({ content: ["a", "b", "c"].join("\n") });
        await sendVSCodeKeys("qa");
        await sendInsertKey("o");
        await sendVSCodeKeys("test");
        await sendEscapeKey();
        await sendVSCodeKeys("q");
        await assertContent(
            {
                content: ["a", "test", "b", "c"],
                cursor: [1, 3],
            },
            client,
        );

        await sendVSCodeKeys("2@a", 1000);
        await assertContent(
            {
                content: ["a", "test", "test", "test", "b", "c"],
                cursor: [3, 3],
            },
            client,
        );

        await sendVSCodeKeys("qa", 200);
        await sendInsertKey("O", 500);
        await sendVSCodeKeys("blah");
        await sendEscapeKey();
        await sendVSCodeKeys("q");
        await assertContent(
            {
                content: ["a", "test", "test", "blah", "test", "b", "c"],
                cursor: [3, 3],
            },
            client,
        );

        await sendVSCodeKeys("2@a", 1000);
        await assertContent(
            {
                content: ["a", "test", "test", "blah", "blah", "blah", "test", "b", "c"],
                cursor: [3, 3],
            },
            client,
        );
    });
});
