import os from "os";
import path from "path";
import fs from "fs";
import { strict as assert } from "assert";

import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    sendVSCodeCommand,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
} from "../utils";

async function get(client: NeovimClient, name: string): Promise<any> {
    return JSON.parse(
        await client.commandOutput(`lua print(vim.fn.json_encode(require'vscode-neovim'.get('${name}')))`),
    );
}

function pathsEqual(a: string, b: string) {
    if (process.platform === "win32") {
        return a.toLowerCase() === b.toLowerCase();
    } else {
        return a == b;
    }
}

describe("Actions", () => {
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

    it("Get simple properties", async () => {
        const filePath = path.join(os.tmpdir(), Math.random().toString());
        fs.writeFileSync(filePath, ["line 1", "line 2"].join("\n"), {
            encoding: "utf8",
        });

        await openTextDocument(filePath);

        let output = await get(client, "");
        assert.equal(output, null);

        output = await get(client, "window");
        assert.equal(output, "[object Object]");

        output = await get(client, "window.showWarningMessage");
        assert.equal(output, "function showWarningMessage() { [native code] }");

        output = await get(client, "window.activeTextEditor.document.fileName");
        assert.ok(pathsEqual(output, filePath), `${output} != ${filePath}`);

        output = await get(client, "window.tabGroups.activeTabGroup.activeTab.isPinned");
        assert.equal(output, false);

        await sendVSCodeCommand("workbench.action.pinEditor");
        try {
            output = await get(client, "window.tabGroups.activeTabGroup.activeTab.isPinned");
            assert.equal(output, true);
        } finally {
            await sendVSCodeCommand("workbench.action.unpinEditor");
        }
    });

    it("Get missing properties", async () => {
        let output = await get(client, "window.property_that_does_not_exist");
        assert.equal(output, null);

        output = await get(client, "window.property_that_does_not_exist.nested_property");
        assert.equal(output, null);

        output = await get(client, "window.visibleTextEditors.99"); // .99 instead of [99] to make parsing simpler
        assert.equal(output, null);
    });

    it("Get array", async () => {
        const filePath = path.join(os.tmpdir(), `${Math.random().toString()}.js`);
        fs.writeFileSync(filePath, ["line 1", "line 2"].join("\n"), {
            encoding: "utf8",
        });

        let output = await get(client, "window.visibleTextEditors.length");
        assert.equal(output, 0);

        output = await get(client, "window.visibleTextEditors.0"); // .0 instead of [0] to make parsing simpler
        assert.equal(output, null);

        await openTextDocument(filePath);

        output = await get(client, "window.visibleTextEditors.length");
        assert.equal(output, 1);

        output = await get(client, "window.visibleTextEditors.0");
        assert.equal(output, "[object Object]");

        output = await get(client, "window.visibleTextEditors.0.document.fileName");
        assert.ok(pathsEqual(output, filePath), `${output} != ${filePath}`);
    });
});
