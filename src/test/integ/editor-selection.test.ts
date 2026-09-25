import { strict as assert } from "assert";

import { NeovimClient } from "neovim";

import { waitUntil } from "../../utils";

import {
    assertContent,
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendNeovimKeys,
    sendVSCodeKeys,
} from "./integrationUtils";

// Use the public eval API to stub the editor collection consumed by the extension.
async function evalInExtension(client: NeovimClient, code: string, args = {}): Promise<unknown> {
    return client.request("nvim_exec_lua", [
        "local code, args = ...; return require('vscode').eval(code, { args = args })",
        [code, args],
    ]);
}

describe("Document editor selection", () => {
    let client: NeovimClient;

    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });
    beforeEach(async () => {
        await closeAllActiveEditors();
    });

    const scenarios = [
        { name: "the active editor ahead of an embedded preview", hideActive: false, embeddedOnly: false },
        { name: "a main editor when focus is elsewhere", hideActive: true, embeddedOnly: false },
        { name: "an embedded-only editor when focus is elsewhere", hideActive: true, embeddedOnly: true },
    ];

    for (const scenario of scenarios) {
        it(`applies normal-mode deletions to ${scenario.name}`, async () => {
            const editor = await openTextDocument({ content: "abc def\nsecond line\nthird line" });
            await assertContent({ content: ["abc def", "second line", "third line"], mode: "n" }, client);

            await evalInExtension(
                client,
                `
                const visible = Object.getOwnPropertyDescriptor(vscode.window, "visibleTextEditors");
                const active = Object.getOwnPropertyDescriptor(vscode.window, "activeTextEditor");
                const editor = vscode.window.activeTextEditor;
                // A read-only embedded preview may acknowledge an edit without
                // changing the shared TextDocument, as observed in the failing session.
                const preview = { ...editor, viewColumn: undefined, edit: async () => true };
                const embedded = { ...editor, viewColumn: undefined };
                Object.defineProperty(vscode.window, "visibleTextEditors", {
                    ...visible,
                    get: () => args.embeddedOnly ? [embedded] : [preview, ...visible.get.call(vscode.window)],
                });
                if (args.hideActive) {
                    Object.defineProperty(vscode.window, "activeTextEditor", { ...active, get: () => undefined });
                }
                globalThis.restoreEditorSelectionTest = () => {
                    Object.defineProperty(vscode.window, "visibleTextEditors", visible);
                    Object.defineProperty(vscode.window, "activeTextEditor", active);
                    delete globalThis.restoreEditorSelectionTest;
                };
                `,
                scenario,
            );
            const assertBuffers = (content: string[]) =>
                waitUntil(async () => {
                    assert.equal(editor.document.getText(), content.join("\n"), "VSCode content is wrong");
                    assert.deepEqual(await (await client.buffer).lines, content, "Neovim content is wrong");
                });
            try {
                const sendKeys = scenario.hideActive ? (keys: string) => sendNeovimKeys(client, keys) : sendVSCodeKeys;
                await sendKeys("x");
                await assertBuffers(["bc def", "second line", "third line"]);
                await sendKeys("dw");
                await assertBuffers(["def", "second line", "third line"]);
                await sendKeys("dd");
                await assertBuffers(["second line", "third line"]);
            } finally {
                await evalInExtension(client, "globalThis.restoreEditorSelectionTest();");
            }
        });
    }
});
