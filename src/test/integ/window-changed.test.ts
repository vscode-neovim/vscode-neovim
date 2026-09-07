import { strict as assert } from "assert";
import path from "path";

import { NeovimClient } from "neovim";
import vscode, { Uri, ViewColumn, commands, window, workspace } from "vscode";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    hideOutputPanel,
    wait,
    waitForCondition,
} from "./integrationUtils";

describe("handle window changed event", () => {
    let client: NeovimClient;

    // Windows are looked up per switch: an editor that stops being visible loses its Nvim
    // window, and gets a new one when it is shown again.
    const findWinId = async (text: string) => {
        for (const win of await client.getWindows()) {
            const lines = await win.buffer.lines;
            if (lines.join("\n").includes(text)) return win.id;
        }
        throw new Error(`no Nvim window showing ${JSON.stringify(text)}`);
    };

    async function setWin(text: string) {
        await client.request("nvim_set_current_win", [await findWinId(text)]);
    }

    let textEditor1: vscode.TextEditor;
    let textEditor2: vscode.TextEditor;
    let notebookEditor: vscode.NotebookEditor;
    let outputChannel: vscode.OutputChannel;

    before(async () => {
        client = await attachTestNvimClient();

        const doc1 = await workspace.openTextDocument({ content: "text 1" });
        textEditor1 = await window.showTextDocument(doc1, ViewColumn.Active);
        await wait(400);

        const doc2 = await workspace.openTextDocument({ content: "text 2" });
        textEditor2 = await window.showTextDocument(doc2, ViewColumn.Two);
        await wait(400);

        const note = await workspace.openNotebookDocument(
            Uri.file(path.join(__dirname, "../../../test_fixtures/window-changed.ipynb")),
        );
        notebookEditor = await window.showNotebookDocument(note, { viewColumn: ViewColumn.Three });
        await wait(400);

        // Make sure the output editor is synchronized
        outputChannel = window.createOutputChannel("testing vscode neovim");
        outputChannel.append("output");
        await wait(200);
        outputChannel.show();
        await wait(200);
        outputChannel.hide();
        await wait(200);
        await commands.executeCommand("workbench.panel.output.focus");
        await wait(400); // don't change

        await hideOutputPanel();
    });
    after(async () => {
        await closeNvimClient(client);
        outputChannel.dispose();
        await closeAllActiveEditors();
    });

    it("text editor", async () => {
        await setWin("text 1");
        await waitForCondition(() => assert.equal(window.activeTextEditor, textEditor1), 8000);

        await setWin("text 2");
        await waitForCondition(() => assert.equal(window.activeTextEditor, textEditor2), 8000);
    });

    it("notebook", async () => {
        await setWin("cell 1");
        await waitForCondition(() => {
            assert.equal(window.activeNotebookEditor, notebookEditor);
            assert.equal(window.activeTextEditor?.document.getText(), "cell 1");
        }, 8000);

        await setWin("cell 2");
        await waitForCondition(() => {
            assert.equal(window.activeNotebookEditor, notebookEditor);
            assert.equal(window.activeTextEditor?.document.getText(), "cell 2");
        }, 8000);
    });

    it("output", async () => {
        // Give the channel a window again: the setup closed the panel.
        outputChannel.show(true);
        await wait(400);

        await setWin("output");
        await waitForCondition(() => assert.equal(window.activeTextEditor?.document.getText(), "output"), 8000);
    });

    it("should ignore window change event when it isn't from neovim", async () => {
        await commands.executeCommand("workbench.action.openGlobalKeybindings");
        await waitForCondition(() => {
            assert.equal(window.activeTextEditor, undefined);
            assert.equal(window.activeNotebookEditor, undefined);
        }, 8000);
    });
});
