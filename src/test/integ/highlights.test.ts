import assert from "assert";

import { NeovimClient } from "neovim";
import vscode, { DecorationOptions, Position, TextEditor } from "vscode";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    sendEscapeKey,
    sendNeovimKeys,
    wait,
} from "./integrationUtils";

describe("Test highlights", () => {
    let client: NeovimClient;
    let orig_activeTextEditor: any;
    let orig_visibleTextEditors: any;

    before(async () => {
        orig_activeTextEditor = Object.getOwnPropertyDescriptor(vscode.window, "activeTextEditor");
        orig_visibleTextEditors = Object.getOwnPropertyDescriptor(vscode.window, "visibleTextEditors");

        await closeAllActiveEditors();
        client = await attachTestNvimClient();
    });

    beforeEach(async () => {
        await closeAllActiveEditors();
    });

    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    afterEach(() => {
        Object.defineProperty(vscode.window, "activeTextEditor", orig_activeTextEditor);
        Object.defineProperty(vscode.window, "visibleTextEditors", orig_visibleTextEditors);
    });

    it("extmark display overlay", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["test ext match", "test ext match", "test ext match"].join("\n"),
        });
        await wait(500);
        await vscode.window.showTextDocument(doc);

        const curEditor = vscode.window.activeTextEditor;
        assert.ok(curEditor != null);
        const stubTextEditor = new TextEditorStub(curEditor);
        Object.defineProperty(vscode.window, "activeTextEditor", {
            get: () => stubTextEditor,
            configurable: true, // Allows us to restore it later
        });
        Object.defineProperty(vscode.window, "visibleTextEditors", {
            get: () => [stubTextEditor],
            configurable: true, // Allows us to restore it later
        });

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
        assert.ok(decoration.renderOptions?.before?.contentText === "j");
        assert.ok(decoration.renderOptions?.before?.color === "#ff0000");
    });

    it("forward search / for long line", async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: ["hello", " ".repeat(3000), "world", " ".repeat(1000)].join(""),
        });
        await vscode.window.showTextDocument(doc);

        const curEditor = vscode.window.activeTextEditor;
        assert.ok(curEditor != null);
        const stubTextEditor = new TextEditorStub(curEditor);
        Object.defineProperty(vscode.window, "activeTextEditor", {
            get: () => stubTextEditor,
            configurable: true, // Allows us to restore it later
        });
        Object.defineProperty(vscode.window, "visibleTextEditors", {
            get: () => [stubTextEditor],
            configurable: true, // Allows us to restore it later
        });

        {
            await sendEscapeKey();
            await sendNeovimKeys(client, "/orl");
            await wait(500);
            assert(stubTextEditor.decorationOptionsList.length > 0);
            const decoration = stubTextEditor.decorationOptionsList[0][0] as DecorationOptions;
            assert.ok(decoration.range.isEqual(new vscode.Range(0, 3006, 0, 3009)));
        }
    });
});

// https://github.com/VSCodeVim/Vim/blob/master/test/historyTracker.test.ts#L181
// Fake class for testing
/* eslint-disable */
class TextEditorStub implements vscode.TextEditor {
    decorationOptionsList: Array<vscode.Range[] | vscode.DecorationOptions[]> = [];

    get visibleRanges() {
        return this.editor.visibleRanges;
    }

    get selection() {
        return this.editor.selection;
    }

    set selection(v) {
        this.editor.selection = v;
    }

    get selections() {
        return this.editor.selections;
    }

    set selections(v) {
        this.editor.selections = v;
    }

    get document() {
        return this.editor.document;
    }

    get options() {
        return this.editor.options;
    }

    set options(v) {
        this.editor.options = v;
    }

    get viewColumn() {
        return this.editor.viewColumn;
    }

    get revealRange() {
        return this.editor.revealRange;
    }

    constructor(private editor: TextEditor) {}

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
    show(column?: vscode.ViewColumn) {}
    hide() {}
}
/* eslint-enable */
