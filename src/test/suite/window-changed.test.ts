import { strict as assert } from "assert";
import path from "path";

import { NeovimClient } from "neovim";
import vscode, { Uri, ViewColumn, commands, window, workspace } from "vscode";

import { attachTestNvimClient, closeAllActiveEditors, closeNvimClient, wait } from "../integrationUtils";

describe("handle window changed event", () => {
    let client: NeovimClient;

    const winIdTextMap = new Map<number, string>();

    const findWinId = (text: string) => {
        for (const [winId, winText] of winIdTextMap.entries()) {
            if (winText.includes(text)) return winId;
        }
        return 0; // should not happen
    };

    async function setWin(winId: number) {
        await client.request("nvim_set_current_win", [winId]);
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

        const wins = await client.getWindows();
        for (const win of wins) {
            const lines = await win.buffer.lines;
            winIdTextMap.set(win.id, lines.join("\n"));
        }
    });
    after(async () => {
        await closeNvimClient(client);
        outputChannel.dispose();
        await closeAllActiveEditors();
    });

    it("text editor", async () => {
        setWin(findWinId("text 1"));
        await wait(800);
        assert.equal(window.activeTextEditor, textEditor1);

        setWin(findWinId("text 2"));
        await wait(400);
        assert.equal(window.activeTextEditor, textEditor2);
    });

    it("notebook", async () => {
        setWin(findWinId("cell 1"));
        await wait(800);
        assert.equal(window.activeNotebookEditor, notebookEditor);
        assert.equal(window.activeTextEditor!.document.getText(), "cell 1");

        setWin(findWinId("cell 2"));
        await wait(400);
        assert.equal(window.activeNotebookEditor, notebookEditor);
        assert.equal(window.activeTextEditor!.document.getText(), "cell 2");
    });

    it("output", async () => {
        setWin(findWinId("output"));
        await wait(400);
        assert.notEqual(window.activeTextEditor, undefined);
        assert.equal(window.activeTextEditor!.document.getText(), "output");
    });

    it("should ignore window change event when it isn't from neovim", async () => {
        await commands.executeCommand("workbench.action.openGlobalKeybindings");
        await wait(400);
        assert.equal(window.activeTextEditor, undefined);
        assert.equal(window.activeNotebookEditor, undefined);
    });
});
