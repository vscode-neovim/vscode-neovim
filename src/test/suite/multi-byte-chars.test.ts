import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    assertContent,
    closeAllActiveEditors,
    closeNvimClient,
    setCursor,
    sendEscapeKey,
    openTextDocument,
    sendInsertKey,
} from "../integrationUtils";

describe("Multi-width characters", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Works - 2col width chars", async () => {
        await openTextDocument({ content: ["测试微服务", "", "没办法跳转到最后一个"].join("\n") });

        await assertContent(
            {
                content: ["测试微服务", "", "没办法跳转到最后一个"],
                cursor: [0, 0],
            },
            client,
        );

        await sendVSCodeKeys("ll");
        await assertContent(
            {
                vsCodeCursor: [0, 2],
            },
            client,
        );

        await sendVSCodeKeys("x", 500);
        await assertContent(
            {
                content: ["测试服务", "", "没办法跳转到最后一个"],
                vsCodeCursor: [0, 2],
            },
            client,
        );

        // await sendVSCodeKeys("vll");
        // await assertContent(
        //     {
        //         vsCodeSelections: [new vscode.Selection(0, 2, 0, 4)],
        //     },
        //     client,
        // );

        await setCursor(2, 5);
        await assertContent(
            {
                vsCodeCursor: [2, 5],
            },
            client,
        );
    });

    it("Works - 1col-2byte width chars", async () => {
        await openTextDocument({ content: ["żżżżżżżż',", "ńńńńńńńń',"].join("\n") });

        await assertContent(
            {
                content: ["żżżżżżżż',", "ńńńńńńńń',"],
                cursor: [0, 0],
            },
            client,
        );
        await sendVSCodeKeys("lll");
        await assertContent({ vsCodeCursor: [0, 3] }, client);

        await sendVSCodeKeys("x");
        await assertContent(
            {
                content: ["żżżżżżż',", "ńńńńńńńń',"],
                vsCodeCursor: [0, 3],
            },
            client,
        );
    });

    it("Works - 1col-3byte width chars", async () => {
        await openTextDocument({ content: ["1ᵩᵩ123"].join("\n") });

        await assertContent(
            {
                content: ["1ᵩᵩ123"],
                cursor: [0, 0],
            },
            client,
        );
        await sendVSCodeKeys("ll");
        await assertContent({ vsCodeCursor: [0, 2] }, client);
        await sendVSCodeKeys("ll");
        await assertContent({ vsCodeCursor: [0, 4] }, client);

        await sendVSCodeKeys("x");
        await assertContent(
            {
                content: ["1ᵩᵩ13"],
                vsCodeCursor: [0, 4],
            },
            client,
        );
    });

    it("Cursor is ok after exiting insert mode - 2 col chars", async () => {
        await openTextDocument({ content: ["测试微服务", "", "没办法跳转到最后一个"].join("\n") });

        await sendVSCodeKeys("lll");
        await assertContent(
            {
                vsCodeCursor: [0, 3],
            },
            client,
        );
        await sendInsertKey();

        await sendEscapeKey();
        await assertContent(
            {
                vsCodeCursor: [0, 2],
            },
            client,
        );
    });

    it("Cursor is ok after exiting insert mode - 1col-2byte chars", async () => {
        await openTextDocument({ content: ["żżżżżżżż',", "ńńńńńńńń',"].join("\n") });

        await sendVSCodeKeys("lll");
        await assertContent(
            {
                vsCodeCursor: [0, 3],
            },
            client,
        );
        await sendInsertKey();

        await sendEscapeKey();
        await assertContent(
            {
                vsCodeCursor: [0, 2],
            },
            client,
        );
    });

    it("Cursor is ok after exiting insert mode - 1col-3byte width chars", async () => {
        await openTextDocument({ content: ["1ᵩᵩ123"].join("\n") });

        await assertContent(
            {
                content: ["1ᵩᵩ123"],
                cursor: [0, 0],
            },
            client,
        );
        await sendVSCodeKeys("ll");
        await assertContent({ vsCodeCursor: [0, 2] }, client);
        await sendInsertKey("a");

        await sendEscapeKey();
        await assertContent({ vsCodeCursor: [0, 2] }, client);

        await sendVSCodeKeys("ll");
        await sendInsertKey("a");
        await sendEscapeKey();
        await assertContent({ vsCodeCursor: [0, 4] }, client);
    });

    it("Cursor is ok after exiting insert mode at end of the line - 1col-3byte width chars", async () => {
        await openTextDocument({ content: "ᵩ123" });

        await sendInsertKey("A");
        await sendEscapeKey();
        await assertContent({ vsCodeCursor: [0, 3] }, client);
    });

    it("Multi byte with tabs", async () => {
        await openTextDocument({ content: "\t\t测试\t微服务" });

        await sendVSCodeKeys("gg0");
        await sendVSCodeKeys("l");
        await assertContent(
            {
                vsCodeCursor: [0, 1],
            },
            client,
        );

        await sendVSCodeKeys("l");
        await assertContent(
            {
                vsCodeCursor: [0, 2],
            },
            client,
        );

        await sendVSCodeKeys("x");
        await assertContent(
            {
                content: ["\t\t试\t微服务"],
                vsCodeCursor: [0, 2],
            },
            client,
        );

        await sendVSCodeKeys("ll");
        await assertContent(
            {
                vsCodeCursor: [0, 4],
            },
            client,
        );

        await sendVSCodeKeys("x");
        await assertContent(
            {
                content: ["\t\t试\t服务"],
                vsCodeCursor: [0, 4],
            },
            client,
        );
    });

    it("Issue #503", async () => {
        await openTextDocument({ content: "ŷaŷbŷcŷd = functionŷ(par1)" });

        await sendVSCodeKeys("f(l");
        await assertContent(
            {
                vsCodeCursor: [0, 26],
            },
            client,
        );

        await sendVSCodeKeys("ci(");
        await assertContent({ vsCodeCursor: [0, 26], content: ["ŷaŷbŷcŷd = functionŷ()"] }, client);
    });

    it("Works - Emoji chars", async () => {
        await openTextDocument({ content: ["🚀🕵️💡🤣", "", "🕵️🕵️🕵️🕵️"].join("\n") });

        await assertContent(
            {
                content: ["🚀🕵️💡🤣", "", "🕵️🕵️🕵️🕵️"],
                cursor: [0, 0],
            },
            client,
        );

        await sendVSCodeKeys("ll");
        await assertContent(
            {
                vsCodeCursor: [0, 5],
            },
            client,
        );

        await sendVSCodeKeys("x");
        await assertContent(
            {
                content: ["🚀🕵️🤣", "", "🕵️🕵️🕵️🕵️"],
                vsCodeCursor: [0, 5],
            },
            client,
        );
        await sendVSCodeKeys("jjdw");
        await assertContent(
            {
                content: ["🚀🕵️🤣", "", "🕵️🕵️"],
                vsCodeCursor: [2, 3],
            },
            client,
        );
    });
});
