import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    assertContent,
    wait,
    closeAllActiveEditors,
    closeNvimClient,
    setCursor,
    sendEscapeKey,
} from "../utils";

describe("Multi-byte characters", () => {
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

    it("Works", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["测试微服务", "", "没办法跳转到最后一个"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait();

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

        await sendVSCodeKeys("x");
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

        await setCursor(2, 5, 1000);
        await assertContent(
            {
                vsCodeCursor: [2, 5],
            },
            client,
        );
    });

    it("Cursor is ok after exiting insert mode", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["测试微服务", "", "没办法跳转到最后一个"].join("\n"),
        });
        await vscode.window.showTextDocument(doc);
        await wait();

        await sendVSCodeKeys("lll");

        await assertContent(
            {
                vsCodeCursor: [0, 3],
            },
            client,
        );
        await sendVSCodeKeys("i");

        await sendEscapeKey();
        await assertContent(
            {
                vsCodeCursor: [0, 2],
            },
            client,
        );
    });
});
