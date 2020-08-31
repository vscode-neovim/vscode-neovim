import { debounce } from "lodash";
import { Buffer, NeovimClient, Window } from "neovim";
import { Disposable, EndOfLine, TextDocument, TextEditor, window, workspace } from "vscode";

import { Logger } from "./logger";
import { NeovimRedrawProcessable } from "./neovim_events_processable";
import { getNeovimCursorPosFromEditor } from "./utils";

// !Note: document and editors in vscode events and namespace are reference stable

export interface BufferManagerSettings {
    neovimViewportWidth: number;
    neovimViewportHeight: number;
}

const LOG_PREFIX = "BufferManager";

/**
 * Manages neovim buffers and windows and maps them to vscode editors & documents
 */
export class BufferManager implements Disposable, NeovimRedrawProcessable {
    private disposables: Disposable[] = [];
    /**
     * Internal sync promise
     */
    private changeLayoutPromise?: Promise<void>;
    private changeLayoutPromiseResolve?: () => void;
    /**
     * Currently opened editors
     * !Note: Order can be any, it doesn't relate to visible order
     */
    private openedEditors: TextEditor[] = [];
    /**
     * Mapping of vscode documents -> neovim buffer id
     */
    private textDocumentToBufferId: Map<TextDocument, number> = new Map();
    /**
     * Mapping of editor column -> neovim win id
     */
    private editorColumnsToWinId: Map<number, number> = new Map();
    /**
     * Mapping of vscode "temp" (without viewColumn) editor -> win id
     */
    private noColumnEditorsToWinId: Map<TextEditor, number> = new Map();
    /**
     * Current grid configurations
     */
    private grids: Map<number, { winId: number }> = new Map();

    /**
     * Buffer event delegate
     */
    public onBufferEvent?: (
        bufId: number,
        tick: number,
        firstLine: number,
        lastLine: number,
        linedata: string[],
        more: boolean,
    ) => void;

    public onBufferInit?: (bufferId: number, textDocument: TextDocument) => void;

    public constructor(private logger: Logger, private client: NeovimClient, private settings: BufferManagerSettings) {
        this.disposables.push(window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors));
        this.disposables.push(window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor));
        this.disposables.push(workspace.onDidCloseTextDocument(this.onDidCloseTextDocument));
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public forceResync(): void {
        this.logger.debug(`${LOG_PREFIX}: force resyncing layout`);
        this.onDidChangeVisibleTextEditors();
        this.onDidChangeActiveTextEditor();
    }

    public async waitForLayoutSync(): Promise<void> {
        if (this.changeLayoutPromise) {
            this.logger.debug(`${LOG_PREFIX}: Waiting for completing layout resyncing`);
            await this.changeLayoutPromise;
        }
    }

    public getTextDocumentForBufferId(id: number): TextDocument | undefined {
        const doc = [...this.textDocumentToBufferId].find(([, bufId]) => id === bufId)?.[0];
        return doc && !doc.isClosed ? doc : undefined;
    }

    public getBufferIdForTextDocument(doc: TextDocument): number | undefined {
        return this.textDocumentToBufferId.get(doc);
    }

    public getGridIdForWinId(winId: number): number | undefined {
        const grid = [...this.grids].find(([, conf]) => conf.winId === winId);
        return grid ? grid[0] : undefined;
    }

    public getWinIdForGridId(gridId: number): number | undefined {
        return this.grids.get(gridId)?.winId;
    }

    public getWinIdForTextEditor(editor: TextEditor): number | undefined {
        if (editor.viewColumn) {
            return this.editorColumnsToWinId.get(editor.viewColumn);
        } else {
            return this.noColumnEditorsToWinId.get(editor);
        }
    }

    public getEditorFromWinId(winId: number): TextEditor | undefined {
        // try first noColumnEditors
        const noColumnEditor = [...this.noColumnEditorsToWinId].find(([, id]) => id === winId);
        if (noColumnEditor) {
            return noColumnEditor[0];
        }
        const viewColumnId = [...this.editorColumnsToWinId].find(([, id]) => id === winId)?.[0];
        if (!viewColumnId) {
            return;
        }
        const editor = this.openedEditors.find((e) => e.viewColumn === viewColumnId);
        return editor;
    }

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
        for (const [name, ...args] of batch) {
            // const firstArg = args[0] || [];
            switch (name) {
                case "win_external_pos":
                case "win_pos": {
                    for (const [grid, win] of args as [number, Window][]) {
                        this.grids.set(grid, { winId: win.id });
                    }
                    break;
                }
                case "win_close": {
                    for (const [grid] of args as [number][]) {
                        this.grids.delete(grid);
                    }
                    break;
                }
            }
        }
    }

    private onDidCloseTextDocument = (e: TextDocument): void => {
        this.textDocumentToBufferId.delete(e);
    };

    private onDidChangeVisibleTextEditors = (editors?: TextEditor[]): void => {
        // !since onDidChangeVisibleTextEditors/onDidChangeActiveTextEditor are synchronyous
        // !and we debounce this event, and possible init new buffers in neovim in async way
        // !we need to wait to complete last call before processing onDidChangeActiveTextEditor
        // !for this init a promise early, then resolve it after processing
        this.logger.debug(`${LOG_PREFIX}: onDidChangeVisibleTextEditors`);
        if (!this.changeLayoutPromise) {
            this.changeLayoutPromise = new Promise((res) => (this.changeLayoutPromiseResolve = res));
        }
        this.syncLayout();
    };

    private onDidChangeActiveTextEditor = (): void => {
        this.logger.debug(`${LOG_PREFIX}: onDidChangeActiveTextEditor`);
        this.syncActiveEditor();
    };

    // ! we're interested only in the editor final layout and vscode may call this function few times, e.g. when moving an editor to other group
    // ! so lets debounce it slightly
    private syncLayout = debounce(
        async () => {
            this.logger.debug(`${LOG_PREFIX}: syncing layout`);
            // store in copy, just in case
            const currentVisibleEditors = [...window.visibleTextEditors];
            const prevVisibleEditors = this.openedEditors;
            // ! need to:
            // ! 1. Switch editors in neovim windows if vscode editor column was changed
            // ! 2. Delete any closed editor column in neovim
            // ! We're forcing bufhidden=wipe, so no need to close buffers manually

            const nvimRequests: [string, unknown[]][] = [];
            // Open/change neovim windows
            this.logger.debug(`${LOG_PREFIX}: new/changed editors/windows`);
            // store currently visible viewColumns, doesn't include undefined viewColumns
            const keepViewColumns: Set<number> = new Set();
            for (const visibleEditor of currentVisibleEditors) {
                this.logger.debug(
                    `${LOG_PREFIX}: Visible editor, viewColumn: ${
                        visibleEditor.viewColumn
                    }, doc: ${visibleEditor.document.uri.toString()}`,
                );
                // create buffer first if not known to the system
                // creating initially not listed buffer to prevent firing autocmd events when
                // buffer name/lines are not yet set. We'll set buflisted after setup
                if (!this.textDocumentToBufferId.has(visibleEditor.document)) {
                    this.logger.debug(`${LOG_PREFIX}: Document not known, init in neovim`);
                    const buf = await this.client.createBuffer(false, true);
                    if (typeof buf === "number") {
                        this.logger.error(`${LOG_PREFIX}: Cannot create a buffer, code: ${buf}`);
                        continue;
                    }
                    await this.initBufferForDocument(visibleEditor.document, visibleEditor, buf);

                    this.logger.debug(
                        `${LOG_PREFIX}: Document: ${visibleEditor.document.uri.toString()}, BufId: ${buf.id}`,
                    );
                    this.textDocumentToBufferId.set(visibleEditor.document, buf.id);
                }
                // editor wasn't changed, skip
                if (prevVisibleEditors.includes(visibleEditor)) {
                    this.logger.debug(`${LOG_PREFIX}: Editor wasn't changed, skip`);
                    continue;
                }
                const editorBufferId = this.textDocumentToBufferId.get(visibleEditor.document)!;
                let winId: number | undefined;
                try {
                    // System editor, like peek view, search results, etc, has undefined viewColumn and we should always create new window for it
                    if (!visibleEditor.viewColumn || !this.editorColumnsToWinId.has(visibleEditor.viewColumn)) {
                        this.logger.debug(
                            `${LOG_PREFIX}: Creating new neovim window for ${visibleEditor.viewColumn} column (undefined is OK here)`,
                        );
                        winId = await this.createNeovimWindow();
                        if (visibleEditor.viewColumn) {
                            this.editorColumnsToWinId.set(visibleEditor.viewColumn, winId);
                        } else {
                            this.noColumnEditorsToWinId.set(visibleEditor, winId);
                        }
                        this.logger.debug(`${LOG_PREFIX}: ViewColumn: ${visibleEditor.viewColumn} - WinId: ${winId}`);
                    } else {
                        winId = this.editorColumnsToWinId.get(visibleEditor.viewColumn);
                    }

                    if (!winId) {
                        throw new Error("Invalid neovim window for editor");
                    }
                    if (visibleEditor.viewColumn) {
                        keepViewColumns.add(visibleEditor.viewColumn);
                    }

                    const cursor = getNeovimCursorPosFromEditor(visibleEditor);
                    this.logger.debug(
                        `${LOG_PREFIX}: Setting buffer: ${editorBufferId} to win: ${winId}, cursor: [${cursor[0]}, ${cursor[1]}]`,
                    );

                    nvimRequests.push(
                        ["nvim_win_set_buf", [winId, editorBufferId]],
                        ["nvim_win_set_cursor", [winId, getNeovimCursorPosFromEditor(visibleEditor)]],
                    );
                } catch (e) {
                    this.logger.error(`${LOG_PREFIX}: ${e.message}`);
                    continue;
                }
            }

            this.logger.debug(`${LOG_PREFIX}: Closing non visible editors`);
            // close any non visible neovim windows
            for (const prevVisibleEditor of prevVisibleEditors) {
                // still visible, skip
                if (currentVisibleEditors.includes(prevVisibleEditor)) {
                    this.logger.debug(
                        `${LOG_PREFIX}: Editor viewColumn: ${prevVisibleEditor.viewColumn}, visibility hasn't changed, skip`,
                    );
                    continue;
                }
                if (!prevVisibleEditor.viewColumn || !keepViewColumns.has(prevVisibleEditor.viewColumn)) {
                    const winId = prevVisibleEditor.viewColumn
                        ? this.editorColumnsToWinId.get(prevVisibleEditor.viewColumn)
                        : this.noColumnEditorsToWinId.get(prevVisibleEditor);

                    if (!winId) {
                        continue;
                    }
                    if (prevVisibleEditor.viewColumn) {
                        this.editorColumnsToWinId.delete(prevVisibleEditor.viewColumn);
                    } else {
                        this.noColumnEditorsToWinId.delete(prevVisibleEditor);
                    }

                    this.logger.debug(
                        `${LOG_PREFIX}: Editor viewColumn: ${prevVisibleEditor.viewColumn}, winId: ${winId}, closing`,
                    );
                    nvimRequests.push(["nvim_win_close", [winId, true]]);
                }
            }
            await this.client.callAtomic(nvimRequests);

            // remember new visible editors
            this.openedEditors = currentVisibleEditors;
            if (this.changeLayoutPromiseResolve) {
                this.changeLayoutPromiseResolve();
            }
            this.changeLayoutPromise = undefined;
        },
        100,
        { leading: false, trailing: true },
    );

    private syncActiveEditor = debounce(
        async () => {
            this.logger.debug(`${LOG_PREFIX}: syncing active editor`);
            if (this.changeLayoutPromise) {
                await this.changeLayoutPromise;
            }
            const activeEditor = window.activeTextEditor;
            if (!activeEditor) {
                return;
            }
            const winId = activeEditor.viewColumn
                ? this.editorColumnsToWinId.get(activeEditor.viewColumn)
                : this.noColumnEditorsToWinId.get(activeEditor);
            if (!winId) {
                this.logger.error(
                    `${LOG_PREFIX}: Unable to determine neovim windows id for editor viewColumn: ${
                        activeEditor.viewColumn
                    }, docUri: ${activeEditor.document.uri.toString()}`,
                );
                return;
            }
            const cursor = getNeovimCursorPosFromEditor(activeEditor);
            this.logger.debug(
                `${LOG_PREFIX}: Setting active editor - viewColumn: ${activeEditor.viewColumn}, winId: ${winId}, cursor: [${cursor[0]}, ${cursor[1]}]`,
            );
            await this.client.request("nvim_set_current_win", [winId]);
        },
        50,
        { leading: false, trailing: true },
    );

    private receivedBufferEvent = (
        buffer: Buffer,
        tick: number,
        firstLine: number,
        lastLine: number,
        linedata: string[],
        more: boolean,
    ): void => {
        this.onBufferEvent && this.onBufferEvent(buffer.id, tick, firstLine, lastLine, linedata, more);
    };

    /**
     * Set buffer options from vscode document
     * @param document
     */
    private async initBufferForDocument(document: TextDocument, editor: TextEditor, buffer: Buffer): Promise<void> {
        const bufId = buffer.id;
        this.logger.debug(`${LOG_PREFIX}: Init buffer for ${bufId}, doc: ${document.uri.toString()}`);

        // !In vscode same document can have different insertSpaces/tabSize settings per editor
        // !however in neovim it's per buffer. We make assumption here that these settings are same for all editors
        // !It's possible to set expandtab/tabstop/shiftwidth when switching editors, but rare case
        const {
            options: { insertSpaces, tabSize },
        } = editor;
        const eol = document.eol === EndOfLine.LF ? "\n" : "\r\n";
        const lines = document.getText().split(eol);

        const requests: [string, unknown[]][] = [
            ["nvim_buf_set_option", [bufId, "expandtab", insertSpaces]],
            // we must use tabstop with value 1 so one tab will be count as one character for highlight
            ["nvim_buf_set_option", [bufId, "tabstop", insertSpaces ? tabSize : 1]],
            // same for shiftwidth - don't want to shift more than one tabstop
            ["nvim_buf_set_option", [bufId, "shiftwidth", insertSpaces ? (tabSize as number) : 1]],
            // fill the buffer
            ["nvim_buf_set_lines", [bufId, 0, 1, false, lines]],
            // set vscode controlled flag so we can check it neovim
            ["nvim_buf_set_var", [bufId, "vscode_controlled", true]],
            // buffer name = document URI
            ["nvim_buf_set_name", [bufId, document.uri.toString()]],
            // clear undo after setting initial lines
            ["nvim_call_function", ["VSCodeClearUndo", [bufId]]],
            // list buffer
            ["nvim_buf_set_option", [bufId, "buflisted", true]],
        ];
        await this.client.callAtomic(requests);
        if (this.onBufferInit) {
            this.onBufferInit(bufId, document);
        }
        // start listen for buffer changes
        buffer.listen("lines", this.receivedBufferEvent);
    }

    /**
     * Create new neovim window
     * !Note: Since we need to know winId before setting actual buffer to it, first create temporary scratch buffer for this window
     * !Later we set actual buffer to this window and temporary buffer will be wiped out
     */
    private async createNeovimWindow(): Promise<number> {
        const buf = await this.client.createBuffer(true, true);
        if (typeof buf === "number") {
            throw new Error(`Unable to create a temporary buffer for new neovim window, code: ${buf}`);
        }
        const win = await this.client.openWindow(buf, false, {
            external: true,
            width: this.settings.neovimViewportWidth,
            height: this.settings.neovimViewportHeight,
        });
        if (typeof win === "number") {
            throw new Error(`Unable to create a new neovim window, code: ${win}`);
        }
        await this.client.callAtomic([
            ["nvim_buf_set_option", [buf.id, "hidden", true]],
            ["nvim_buf_set_option", [buf.id, "bufhidden", "wipe"]],
        ]);
        return win.id;
    }
}
