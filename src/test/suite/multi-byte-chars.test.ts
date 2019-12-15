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
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
        await wait(2000);

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
                cursor: [0, 2],
            },
            client,
        );

        await sendVSCodeKeys("x");
        await assertContent(
            {
                content: ["测试服务", "", "没办法跳转到最后一个"],
                cursor: [0, 2],
            },
            client,
        );

        await sendVSCodeKeys("vll");
        await assertContent(
            {
                vsCodeSelections: [new vscode.Selection(0, 2, 0, 4)],
            },
            client,
        );

        await setCursor(2, 5, 500);
        await assertContent(
            {
                cursor: [2, 5],
            },
            client,
        );
    });
});
