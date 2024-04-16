import assert from "assert";

import { NeovimClient } from "neovim";
import vscode, { DecorationOptions, Position, window } from "vscode";

import { attachTestNvimClient, closeAllActiveEditors, closeNvimClient, wait } from "../integrationUtils";

describe("Test ext mark", () => {
    let client: NeovimClient;
    let realWindow: typeof vscode.window | undefined;

    const restoreWindow = (): void => {
        if (realWindow) {
            vscode.window = realWindow;
            realWindow = undefined;
        }
    };

    before(async () => {
        await closeAllActiveEditors();
        client = await attachTestNvimClient();
    });

    after(async () => {
        restoreWindow();
        await closeNvimClient(client);
    });

    afterEach(async () => {
        restoreWindow();
    });

    it("extmark display overlay", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test ext match", "test ext match", "test ext match"].join("\n"),
        });
        await wait(500);
        await vscode.window.showTextDocument(doc);

        const stubTextEditor = new TextEditorStub();
        const curEditor = vscode.window.activeTextEditor;
        assert.ok(curEditor != null);
        stubTextEditor.document = curEditor.document;
        stubTextEditor.options = curEditor.options;
        stubTextEditor.viewColumn = curEditor.viewColumn!;
        realWindow = vscode.window;
        vscode.window = {
            activeTextEditor: stubTextEditor,
            visibleTextEditors: [stubTextEditor],
            createTextEditorDecorationType: window.createTextEditorDecorationType,
        } as any;

        await client.command("hi ExtMarkRed guifg=#ff0000 guibg=#000000");
        await client.call("nvim_win_set_cursor", [0, [1, 1]]);
        const ns_id = await client.call("nvim_create_namespace", ["test"]);
        await wait(500);

        await client.call("nvim_buf_set_extmark", [
            0,
            ns_id,
            1,
            2,
            {
                virt_text: [["j", "ExtMarkRed"]],
                virt_text_pos: "overlay",
            },
        ]);

        await wait(500);
        assert(stubTextEditor.decorationOptionsList.length > 0);
        const decoration = stubTextEditor.decorationOptionsList[0][0] as DecorationOptions;

        assert.ok(decoration.renderOptions); // it should have overlay decoration
        assert.ok(decoration.renderOptions?.before?.contentText == "j");
        assert.ok(decoration.renderOptions?.before?.color == "#ff0000");
    });
});

// https://github.com/VSCodeVim/Vim/blob/master/test/historyTracker.test.ts#L181
// Fake class for testing
/* eslint-disable */
class TextEditorStub implements vscode.TextEditor {
    document!: vscode.TextDocument;
    selection!: vscode.Selection;
    selections!: vscode.Selection[];
    visibleRanges!: vscode.Range[];
    options!: vscode.TextEditorOptions;
    viewColumn!: vscode.ViewColumn;

    decorationOptionsList: Array<vscode.Range[] | vscode.DecorationOptions[]> = [];

    constructor() {
        this.selection = new vscode.Selection(0, 0, 0, 0);
        this.selections = [this.selection];
    }
    async edit(
        callback: (editBuilder: vscode.TextEditorEdit) => void,
        options?: { undoStopBefore: boolean; undoStopAfter: boolean },
    ) {
        return true;
    }
    // @ts-ignore
    async insertSnippet(
        snippet: vscode.SnippetString,
        location?: vscode.Position | vscode.Range | ReadonlyArray<Position> | ReadonlyArray<vscode.Range>,
        options?: { undoStopBefore: boolean; undoStopAfter: boolean },
    ) {
        return true;
    }
    setDecorations(
        decorationType: vscode.TextEditorDecorationType,
        rangesOrOptions: vscode.Range[] | vscode.DecorationOptions[],
    ) {
        this.decorationOptionsList.push(rangesOrOptions);
    }
    revealRange(range: vscode.Range, revealType?: vscode.TextEditorRevealType) {}
    show(column?: vscode.ViewColumn) {}
    hide() {}
}
/* eslint-enable */
