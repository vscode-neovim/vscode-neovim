import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeKeys,
    assertContent,
    closeAllActiveEditors,
    setCursor,
    closeNvimClient,
    openTextDocument,
    wait,
} from "../integrationUtils";

describe("Yanking and pasting", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Yank and paste works", async () => {
        await openTextDocument({ content: "some line\notherline" });
        await setCursor(1, 1);

        await sendVSCodeKeys("yy");
        await sendVSCodeKeys("p");
        await assertContent(
            {
                content: ["some line", "otherline", "otherline"],
                cursor: [2, 0],
            },
            client,
        );

        await wait(200); // wait for document change
        await setCursor(1, 1);
        await sendVSCodeKeys("P");
        await assertContent(
            {
                content: ["some line", "otherline", "otherline", "otherline"],
                cursor: [1, 0],
            },
            client,
        );
    });

    // todo: sometimes failing due to cursor positions, sometimes works. most often is failing
    it("Pasting into document with single line", async () => {
        await openTextDocument({ content: "some line\notherline" });
        await sendVSCodeKeys("yj");

        await openTextDocument({ content: "" });
        await sendVSCodeKeys("p");
        await assertContent(
            {
                content: ["", "some line", "otherline"],
                cursor: [1, 0],
            },
            client,
        );

        await openTextDocument({ content: "blah" });
        await sendVSCodeKeys("p");
        await assertContent(
            {
                content: ["blah", "some line", "otherline"],
                cursor: [1, 0],
            },
            client,
        );
    });

    it.skip("pasting line after vi{", async () => {
        // see https://github.com/asvetliakov/vscode-neovim/issues/116
        await openTextDocument({
            content: ["var test='a'", "", "function blah() {", "    var another;", "}", ""].join("\n"),
        });

        await sendVSCodeKeys("yy");
        await sendVSCodeKeys("jjj");
        await sendVSCodeKeys("vi{p");
        await assertContent(
            {
                content: ["var test='a'", "", "function blah() {", "", "var test='a'", "}", ""],
            },
            client,
        );
    });
});
