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
    wait,
} from "../utils";

async function eval_from_nvim(client: NeovimClient, code: string): Promise<any> {
    return JSON.parse(
        await client.commandOutput(`lua print(vim.fn.json_encode(require'vscode-neovim'.eval('${code}')))`),
    );
}

async function eval_from_nvim_with_args(client: NeovimClient, code: string, args: string): Promise<any> {
    return JSON.parse(
        await client.commandOutput(`lua print(vim.fn.json_encode(require'vscode-neovim'.eval('${code}', ${args})))`),
    );
}

function pathsEqual(a: string, b: string) {
    if (process.platform === "win32") {
        return a.toLowerCase() === b.toLowerCase();
    } else {
        return a == b;
    }
}

describe("Eval VSCode", () => {
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

    it("Javascript Evaluation", async () => {
        let output = await eval_from_nvim(client, "");
        assert.equal(output, null);

        output = await eval_from_nvim(client, "123");
        assert.equal(output, null);

        output = await eval_from_nvim(client, "return 123");
        assert.equal(output, 123);

        output = await eval_from_nvim(client, "return {foo: 123};");
        assert.equal(output, "[object Object]");

        output = await eval_from_nvim(client, "return JSON.stringify({foo: 123});");
        assert.equal(output, '{"foo":123}');

        output = await eval_from_nvim(client, "function foo() {}; return foo;");
        assert.equal(output, "[Function: foo]");

        output = await eval_from_nvim(client, "function f(v) {return 100 + v;}; return f(2);");
        assert.equal(output, 102);

        output = await eval_from_nvim(client, "async function f(v) {return 100 + v;}; return await f(2);");
        assert.equal(output, 102);

        output = await eval_from_nvim_with_args(client, "return args;", "12");
        assert.equal(output, 12);

        output = await eval_from_nvim_with_args(client, "return args.foo", "{ foo = 12 }");
        assert.equal(output, 12);

        output = await eval_from_nvim_with_args(client, "return args[0]", "{ 12 }");
        assert.equal(output, 12);
    });

    it("API interactions", async () => {
        const filePath = path.join(os.tmpdir(), Math.random().toString());
        fs.writeFileSync(filePath, ["line 1", "line 2"].join("\n"), {
            encoding: "utf8",
        });

        await openTextDocument(filePath);

        let output = await eval_from_nvim(client, "return vscode.window");
        assert.equal(output, "[object Object]");

        output = await eval_from_nvim(client, "return vscode.window.showWarningMessage");
        assert.equal(output, "[Function: showWarningMessage]");

        output = await eval_from_nvim(client, "return vscode.window.activeTextEditor.document.fileName");
        assert.ok(pathsEqual(output, filePath), `${output} != ${filePath}`);

        output = await eval_from_nvim(client, "return vscode.window.tabGroups.activeTabGroup.activeTab.isPinned");
        assert.equal(output, false);

        await eval_from_nvim(client, 'await vscode.commands.executeCommand("workbench.action.pinEditor", "")');
        await wait(200);
        try {
            output = await eval_from_nvim(client, "return vscode.window.tabGroups.activeTabGroup.activeTab.isPinned");
            assert.equal(output, true);
        } finally {
            await sendVSCodeCommand("workbench.action.unpinEditor");
        }

        await eval_from_nvim_with_args(client, "await vscode.env.clipboard.writeText(args.text)", "{ text = 'hi'}");
        output = await eval_from_nvim(client, "return await vscode.env.clipboard.readText()");
        assert.equal(output, "hi");

        output = await eval_from_nvim(client, 'return globalThis["foo"];');
        assert.equal(output, null);
        await eval_from_nvim(client, 'globalThis["foo"] = 123');
        output = await eval_from_nvim(client, 'return globalThis["foo"];');
        assert.equal(output, 123);
    });

    it("Error handling", async () => {
        await assert.rejects(async () => {
            await eval_from_nvim(client, "!$%");
        }, /Error executing lua Unexpected token '}'/);

        let output = await eval_from_nvim(client, "return vscode.window.property_that_does_not_exist");
        assert.equal(output, null);

        await assert.rejects(async () => {
            await eval_from_nvim(client, "return vscode.window.property_that_does_not_exist.nested_property");
        }, /Error executing lua Cannot read properties of undefined \(reading 'nested_property'\)/);

        output = await eval_from_nvim(client, "return vscode.window.visibleTextEditors[99]");
        assert.equal(output, null);

        await assert.rejects(async () => {
            await eval_from_nvim(client, 'await vscode.commands.executeCommand("unknown_action", "")');
        }, /Error executing lua command 'unknown_action' not found/);
    });
});