import path from "path";

import { debounce } from "lodash-es";
import { Buffer, NeovimClient, Window } from "neovim";
import { ATTACH } from "neovim/lib/api/Buffer";
import {
    commands,
    Disposable,
    EndOfLine,
    Selection,
    TextDocument,
    TextEditor,
    TextEditorOptionsChangeEvent,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";

import { Logger } from "./logger";
import { NeovimExtensionRequestProcessable, NeovimRedrawProcessable } from "./neovim_events_processable";
import { calculateEditorColFromVimScreenCol, callAtomic, getNeovimCursorPosFromEditor } from "./utils";

// !Note: document and editors in vscode events and namespace are reference stable
// ! Integration notes:
// ! When opening an editor with a document first time, a buffer is created in neovim along with new window for each buffer
// ! When switching off editor, the buffer is being hidden & unloaded in neovim if it's last visitlbe buffer (see :help bufhidden)

export interface BufferManagerSettings {
    neovimViewportWidth: number;
    neovimViewportHeight: number;
}

const LOG_PREFIX = "BufferManager";

const BUFFER_NAME_PREFIX = "__vscode_neovim__-";

/**
 * Manages neovim buffers and windows and maps them to vscode editors & documents
 */
export class BufferManager implements Disposable, NeovimRedrawProcessable, NeovimExtensionRequestProcessable {
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
     * Text documents originated externally, as consequence of neovim command, like :help or :PlugStatus
     */
    private externalTextDocuments: WeakSet<TextDocument> = new Set();
    /**
     * Mapping of vscode documents -> neovim buffer id
     */
    private textDocumentToBufferId: Map<TextDocument, number> = new Map();
    /**
     * Mapping of vscode "temp" (without viewColumn) editor -> win id
     */
    private textEditorToWinId: Map<TextEditor, number> = new Map();
    /**
     * Mapping of winId -> editor
     */
    private winIdToEditor: Map<number, TextEditor> = new Map();
    /**
     * Current grid configurations
     */
    private grids: Map<number, { winId: number }> = new Map();
    /**
     * Tab configuration for each editor
     */
    private editorTabConfiguration: WeakMap<TextEditor, { tabSize: number; insertSpaces: boolean }> = new WeakMap();

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
        this.disposables.push(window.onDidChangeTextEditorOptions(this.onDidChangeEditorOptions));
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public async forceResync(): Promise<void> {
        this.logger.debug(`${LOG_PREFIX}: force resyncing layout`);
        await this.syncLayout();
        await this.syncActiveEditor();
    }

    public async waitForLayoutSync(): Promise<void> {
        if (this.changeLayoutPromise) {
            this.logger.debug(`${LOG_PREFIX}: Waiting for completing layout resyncing`);
            await this.changeLayoutPromise;
            this.logger.debug(`${LOG_PREFIX}: Waiting done`);
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
        const grid = [...this.grids].reverse().find(([, conf]) => conf.winId === winId);
        return grid ? grid[0] : undefined;
    }

    public getWinIdForGridId(gridId: number): number | undefined {
        return this.grids.get(gridId)?.winId;
    }

    public getWinIdForTextEditor(editor: TextEditor): number | undefined {
        return this.textEditorToWinId.get(editor);
    }

    public getEditorFromWinId(winId: number): TextEditor | undefined {
        // try first noColumnEditors
        const noColumnEditor = [...this.textEditorToWinId].find(([, id]) => id === winId);
        if (noColumnEditor) {
            return noColumnEditor[0];
        }
        return this.winIdToEditor.get(winId);
    }

    public getGridIdFromEditor(editor: TextEditor): number | undefined {
        return this.getGridIdForWinId(this.getWinIdForTextEditor(editor) || 0);
    }

    public getEditorFromGridId(gridId: number): TextEditor | undefined {
        const winId = this.getWinIdForGridId(gridId);
        if (!winId) {
            return;
        }
        return this.getEditorFromWinId(winId);
    }

    public isExternalTextDocument(textDoc: TextDocument): boolean {
        if (textDoc.uri.scheme === "output") {
            return true;
        }
        return this.externalTextDocuments.has(textDoc);
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

    public async handleExtensionRequest(name: string, args: unknown[]): Promise<void> {
        switch (name) {
            case "open-file": {
                const [fileName, close] = args as [string, number | "all"];
                const currEditor = window.activeTextEditor;
                let doc: TextDocument | undefined;
                try {
                    if (fileName === "__vscode_new__") {
                        doc = await workspace.openTextDocument();
                    } else {
                        const normalizedName = fileName.trim();
                        const filePath = this.findPathFromFileName(normalizedName);
                        doc = await workspace.openTextDocument(filePath);
                    }
                } catch (error) {
                    this.logger.error(`${LOG_PREFIX}: Error opening file ${fileName}, ${error}`);
                }
                if (!doc) {
                    return;
                }
                let viewColumn: ViewColumn | undefined;
                if (close && close !== "all" && currEditor) {
                    viewColumn = currEditor.viewColumn;
                    await commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
                }
                await window.showTextDocument(doc, viewColumn);
                if (close === "all") {
                    await commands.executeCommand("workbench.action.closeOtherEditors");
                }
                break;
            }
            case "external-buffer": {
                const [name, idStr, expandTab, tabStop] = args as [string, string, number, number, number];
                if (name.startsWith(`${BUFFER_NAME_PREFIX}output:`)) {
                    break;
                }
                const id = parseInt(idStr, 10);
                if (!(name && this.isVscodeUriName(name))) {
                    this.logger.debug(`${LOG_PREFIX}: Attaching new external buffer: ${name}, id: ${id}`);
                    if (id === 1) {
                        this.logger.debug(`${LOG_PREFIX}: ${id} is the first neovim buffer, skipping`);
                        return;
                    }
                    await this.attachNeovimExternalBuffer(name, id, !!expandTab, tabStop);
                } else if (name) {
                    const normalizedName = name.startsWith(BUFFER_NAME_PREFIX) ? name.substr(18) : name;
                    this.logger.debug(`${LOG_PREFIX}: Buffer request for ${normalizedName}, bufId: ${idStr}`);
                    try {
                        let doc = this.findDocFromUri(normalizedName);
                        if (!doc) {
                            this.logger.debug(`${LOG_PREFIX}: Opening a doc: ${normalizedName}`);
                            doc = await workspace.openTextDocument(Uri.parse(normalizedName, true));
                        }
                        let forceTabOptions = false;
                        if (!this.textDocumentToBufferId.has(doc)) {
                            this.logger.debug(
                                `${LOG_PREFIX}: No doc -> buffer mapping exists, assigning mapping and init buffer options`,
                            );
                            const buffers = await this.client.buffers;
                            const buf = buffers.find((b) => b.id === id);
                            if (buf) {
                                forceTabOptions = true;
                                await this.initBufferForDocument(doc, buf);
                            }
                            this.textDocumentToBufferId.set(doc, id);
                        }
                        if (window.activeTextEditor?.document !== doc) {
                            // this.skipJumpsForUris.set(normalizedNamee, true);
                            const editor = await window.showTextDocument(doc, {
                                // viewColumn: vscode.ViewColumn.Active,
                                // !need to force editor to appear in the same column even if vscode 'revealIfOpen' setting is true
                                viewColumn: window.activeTextEditor
                                    ? window.activeTextEditor.viewColumn
                                    : ViewColumn.Active,
                                preserveFocus: false,
                                preview: false,
                            });
                            this.editorTabConfiguration.set(editor, {
                                insertSpaces: editor.options.insertSpaces as boolean,
                                tabSize: editor.options.tabSize as number,
                            });
                            if (forceTabOptions) {
                                await this.resyncBufferTabOptions(editor, id);
                            }
                        }
                    } catch {
                        // todo: show error
                    }
                }
                break;
            }
        }
    }

    /**
     * !Note when closing text editor with document, vscode sends onDidCloseTextDocument first
     * @param doc
     */
    private onDidCloseTextDocument = (doc: TextDocument): void => {
        const hasVisibleEditor = !!this.openedEditors.find((d) => d.document === doc);
        // we'll handle it in onDidChangeVisibleTextEditors()
        if (!hasVisibleEditor) {
            // const bufId = this.textDocumentToBufferId.get(doc);
            this.textDocumentToBufferId.delete(doc);
            // buffer unloading breaks jumplist https://github.com/asvetliakov/vscode-neovim/issues/350
            // if (bufId) {
            //     this.unloadBuffer(bufId);
            // }
        }
    };

    private onDidChangeVisibleTextEditors = (): void => {
        // !since onDidChangeVisibleTextEditors/onDidChangeActiveTextEditor are synchronyous
        // !and we debounce this event, and possible init new buffers in neovim in async way
        // !we need to wait to complete last call before processing onDidChangeActiveTextEditor
        // !for this init a promise early, then resolve it after processing
        this.logger.debug(`${LOG_PREFIX}: onDidChangeVisibleTextEditors`);
        if (!this.changeLayoutPromise) {
            this.changeLayoutPromise = new Promise((res) => (this.changeLayoutPromiseResolve = res));
        }
        this.syncLayoutDebounced();
    };

    private onDidChangeActiveTextEditor = (): void => {
        this.logger.debug(`${LOG_PREFIX}: onDidChangeActiveTextEditor`);
        this.syncActiveEditorDebounced();
    };

    private syncLayout = async (): Promise<void> => {
        this.logger.debug(`${LOG_PREFIX}: syncing layout`);
        // store in copy, just in case
        const currentVisibleEditors = [...window.visibleTextEditors];
        const prevVisibleEditors = this.openedEditors;

        const nvimRequests: [string, unknown[]][] = [];
        // Open/change neovim windows
        this.logger.debug(`${LOG_PREFIX}: new/changed editors/windows`);
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
                await this.initBufferForDocument(visibleEditor.document, buf, visibleEditor);

                this.logger.debug(
                    `${LOG_PREFIX}: Document: ${visibleEditor.document.uri.toString()}, BufId: ${buf.id}`,
                );
                this.textDocumentToBufferId.set(visibleEditor.document, buf.id);
            }
            // editor wasn't changed, skip
            // !Note always sync opened editors, it doesn't hurt and and solves the curious problem when there are
            // !few visible editors with same viewColumn (happens when you open search editor, when jump to a file from it)
            // if (prevVisibleEditors.includes(visibleEditor)) {
            //     this.logger.debug(`${LOG_PREFIX}: Editor wasn't changed, skip`);
            //     if (visibleEditor.viewColumn) {
            //         keepViewColumns.add(visibleEditor.viewColumn);
            //     }
            //     continue;
            // }
            const editorBufferId = this.textDocumentToBufferId.get(visibleEditor.document)!;
            let winId: number | undefined;
            try {
                if (!this.textEditorToWinId.has(visibleEditor)) {
                    this.logger.debug(
                        `${LOG_PREFIX}: Creating new neovim window for ${visibleEditor.viewColumn} column (undefined is OK here)`,
                    );
                    winId = await this.createNeovimWindow(editorBufferId);
                    this.logger.debug(`${LOG_PREFIX}: Created new window: ${winId}`);
                    this.logger.debug(`${LOG_PREFIX}: ViewColumn: ${visibleEditor.viewColumn} - WinId: ${winId}`);
                    const cursor = getNeovimCursorPosFromEditor(visibleEditor);
                    this.logger.debug(
                        `${LOG_PREFIX}: Setting buffer: ${editorBufferId} to win: ${winId}, cursor: [${cursor[0]}, ${cursor[1]}]`,
                    );
                    await this.client.request("nvim_win_set_cursor", [winId, cursor]);
                    this.textEditorToWinId.set(visibleEditor, winId);
                    this.winIdToEditor.set(winId, visibleEditor);
                }
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
            const document = prevVisibleEditor.document;
            if (!currentVisibleEditors.find((e) => e.document === document) && document.isClosed) {
                this.logger.debug(
                    `${LOG_PREFIX}: Document ${document.uri.toString()} is not visible and closed, unloading buffer id: ${this.textDocumentToBufferId.get(
                        document,
                    )}`,
                );
                const bufId = this.textDocumentToBufferId.get(document);
                this.textDocumentToBufferId.delete(document);
                if (bufId) {
                    nvimRequests.push(["nvim_command", [`bdelete! ${bufId}`]]);
                }
            }
            const winId = this.textEditorToWinId.get(prevVisibleEditor);

            if (!winId) {
                continue;
            }

            this.logger.debug(
                `${LOG_PREFIX}: Editor viewColumn: ${prevVisibleEditor.viewColumn}, winId: ${winId}, closing`,
            );
            this.textEditorToWinId.delete(prevVisibleEditor);
            this.winIdToEditor.delete(winId);
            nvimRequests.push(["nvim_win_close", [winId, true]]);
        }
        await callAtomic(this.client, nvimRequests, this.logger, LOG_PREFIX);

        // remember new visible editors
        this.openedEditors = currentVisibleEditors;
        if (this.changeLayoutPromiseResolve) {
            this.changeLayoutPromiseResolve();
        }
        this.changeLayoutPromise = undefined;
    };

    // ! we're interested only in the editor final layout and vscode may call this function few times, e.g. when moving an editor to other group
    // ! so lets debounce it slightly
    private syncLayoutDebounced = debounce(this.syncLayout, 200, { leading: false, trailing: true });

    private syncActiveEditor = async (): Promise<void> => {
        this.logger.debug(`${LOG_PREFIX}: syncing active editor`);
        await this.waitForLayoutSync();

        const activeEditor = window.activeTextEditor;
        if (!activeEditor) {
            return;
        }
        const winId = this.textEditorToWinId.get(activeEditor);
        if (!winId) {
            this.logger.warn(
                `${LOG_PREFIX}: Unable to determine neovim windows id for editor viewColumn: ${
                    activeEditor.viewColumn
                }, docUri: ${activeEditor.document.uri.toString()}`,
            );
            return;
        }
        this.logger.debug(
            `${LOG_PREFIX}: Setting active editor - viewColumn: ${activeEditor.viewColumn}, winId: ${winId}`,
        );
        await this.client.request("nvim_set_current_win", [winId]);
    };

    private syncActiveEditorDebounced = debounce(this.syncActiveEditor, 100, { leading: false, trailing: true });

    private onDidChangeEditorOptions = (e: TextEditorOptionsChangeEvent): void => {
        this.logger.debug(`${LOG_PREFIX}: Received onDidChangeEditorOptions`);
        const bufId = this.textDocumentToBufferId.get(e.textEditor.document);
        if (!bufId) {
            this.logger.warn(`${LOG_PREFIX}: No buffer for onDidChangeEditorOptions, skipping`);
            return;
        }
        const prevOptions = this.editorTabConfiguration.get(e.textEditor);
        if (
            !prevOptions ||
            prevOptions.insertSpaces !== e.options.insertSpaces ||
            prevOptions.tabSize !== e.options.tabSize
        ) {
            this.logger.debug(`${LOG_PREFIX}: Updating tab options for bufferId: ${bufId}`);
            this.editorTabConfiguration.set(e.textEditor, {
                insertSpaces: e.options.insertSpaces as boolean,
                tabSize: e.options.tabSize as number,
            });
            this.resyncBufferTabOptions(e.textEditor, bufId);
        }
    };

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
    private async initBufferForDocument(document: TextDocument, buffer: Buffer, editor?: TextEditor): Promise<void> {
        const bufId = buffer.id;
        this.logger.debug(`${LOG_PREFIX}: Init buffer for ${bufId}, doc: ${document.uri.toString()}`);

        // !In vscode same document can have different insertSpaces/tabSize settings per editor
        // !however in neovim it's per buffer. We make assumption here that these settings are same for all editors
        // !It's possible to set expandtab/tabstop/shiftwidth when switching editors, but rare case
        const {
            options: { insertSpaces, tabSize },
        } = editor || { options: { insertSpaces: true, tabSize: 4 } };
        const eol = document.eol === EndOfLine.LF ? "\n" : "\r\n";
        const lines = document.getText().split(eol);

        if (editor) {
            this.editorTabConfiguration.set(editor, {
                tabSize: tabSize as number,
                insertSpaces: insertSpaces as boolean,
            });
        }

        const requests: [string, unknown[]][] = [
            ["nvim_buf_set_option", [bufId, "expandtab", insertSpaces]],
            ["nvim_buf_set_option", [bufId, "tabstop", tabSize]],
            ["nvim_buf_set_option", [bufId, "shiftwidth", tabSize]],
            // fill the buffer
            ["nvim_buf_set_lines", [bufId, 0, -1, false, lines]],
            // set vscode controlled flag so we can check it neovim
            ["nvim_buf_set_var", [bufId, "vscode_controlled", true]],
            // make sure to disable syntax (yeah we're doing it neovim files, but better to be safe than not)
            // !Setting to false breaks filetype detection
            // ["nvim_buf_set_option", [bufId, "syntax", false]],
            // buffer name = document URI
            ["nvim_buf_set_name", [bufId, BUFFER_NAME_PREFIX + document.uri.toString()]],
            // Turn off modifications for external documents
            ["nvim_buf_set_option", [bufId, "modifiable", !this.isExternalTextDocument(document)]],
            // force nofile, just in case if the buffer was created externally
            ["nvim_buf_set_option", [bufId, "buftype", "nofile"]],
            // list buffer
            ["nvim_buf_set_option", [bufId, "buflisted", true]],
        ];
        await callAtomic(this.client, requests, this.logger, LOG_PREFIX);
        // Looks like need to be in separate request
        if (!this.isExternalTextDocument(document)) {
            await this.client.callFunction("VSCodeClearUndo", bufId);
        }
        if (this.onBufferInit) {
            this.onBufferInit(bufId, document);
        }
        // start listen for buffer changes
        buffer.listen("lines", this.receivedBufferEvent);
    }

    private async resyncBufferTabOptions(editor: TextEditor, bufId: number): Promise<void> {
        const {
            options: { insertSpaces, tabSize },
        } = editor;

        const requests: [string, unknown[]][] = [
            ["nvim_buf_set_option", [bufId, "expandtab", insertSpaces]],
            ["nvim_buf_set_option", [bufId, "tabstop", tabSize]],
            ["nvim_buf_set_option", [bufId, "shiftwidth", tabSize]],
        ];
        await callAtomic(this.client, requests, this.logger, LOG_PREFIX);
    }

    /**
     * Create new neovim window
     */
    private async createNeovimWindow(bufId: number): Promise<number> {
        await this.client.setOption("eventignore", "BufWinEnter,BufEnter,BufLeave");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = await this.client.openWindow(bufId as any, false, {
            external: true,
            width: this.settings.neovimViewportWidth,
            height: this.settings.neovimViewportHeight,
        });
        await this.client.setOption("eventignore", "");
        if (typeof win === "number") {
            throw new Error(`Unable to create a new neovim window, code: ${win}`);
        }
        return win.id;
    }

    private async unloadBuffer(bufId: number): Promise<void> {
        try {
            await this.client.command(`bunload! ${bufId}`);
        } catch (e) {
            this.logger.warn(`${LOG_PREFIX}: Can't unload the buffer: ${bufId}, err: ${e?.message}`);
        }
    }

    private isVscodeUriName(name: string): boolean {
        if (/:\/\//.test(name)) {
            return true;
        }
        if (name.startsWith("output:") || name.startsWith(`${BUFFER_NAME_PREFIX}output:`)) {
            return true;
        }
        if (name.startsWith("/search-editor:") || name.startsWith(`${BUFFER_NAME_PREFIX}/search-editor:`)) {
            return true;
        }
        return false;
    }

    private findPathFromFileName(name: string): string {
        const rootFolderPath = workspace.workspaceFolders![0].uri.fsPath;
        let filePath: string;
        if (rootFolderPath) {
            filePath = path.resolve(rootFolderPath, name);
        } else {
            filePath = name;
        }
        return filePath;
    }

    private findDocFromUri(uri: string): TextDocument | undefined {
        if (uri.startsWith("/search-editor")) {
            uri = uri.slice(1);
        }
        return workspace.textDocuments.find((d) => d.uri.toString() === uri);
    }

    private async attachNeovimExternalBuffer(
        name: string,
        id: number,
        expandTab: boolean,
        tabStop: number,
    ): Promise<void> {
        const buffers = await this.client.buffers;
        const buf = buffers.find((b) => b.id === id);
        if (!buf) {
            return;
        }
        // don't bother with displaying empty buffer
        const lines = await buf.lines;
        if (!lines.length || (lines.length === 1 && !lines[0])) {
            this.logger.debug(`${LOG_PREFIX}: Skipping empty external buffer ${id}`);
            return;
        }
        const doc = await workspace.openTextDocument({ content: lines.join("\n") });
        this.externalTextDocuments.add(doc);
        this.textDocumentToBufferId.set(doc, id);
        this.onBufferInit && this.onBufferInit(id, doc);
        buf.listen("lines", this.receivedBufferEvent);
        await buf[ATTACH](true);

        const windows = await this.client.windows;
        let closeWinId = 0;
        for (const window of windows) {
            const buf = await window.buffer;
            if (buf.id === id) {
                this.logger.debug(
                    `${LOG_PREFIX}: Found window assigned to external buffer ${id}, winId: ${
                        window.id
                    }, isKnownWindow: ${this.winIdToEditor.has(window.id)}`,
                );
                if (!this.winIdToEditor.has(window.id)) {
                    closeWinId = window.id;
                }
            }
        }

        const editor = await window.showTextDocument(doc, {
            preserveFocus: false,
            preview: true,
            viewColumn: ViewColumn.Active,
        });
        this.editorTabConfiguration.set(editor, { tabSize: tabStop, insertSpaces: expandTab });
        editor.options.insertSpaces = expandTab;
        editor.options.tabSize = tabStop;

        if (closeWinId) {
            // !Another hack is to retrieve cursor with delay - when we receive an external buffer the cursor pos is not immediately available
            // [1, 0]
            setTimeout(async () => {
                const neovimCursor: [number, number] = await this.client.request("nvim_win_get_cursor", [closeWinId]);
                if (neovimCursor) {
                    this.logger.debug(
                        `${LOG_PREFIX}: Adjusting cursor pos for external buffer: ${id}, originalPos: [${neovimCursor[0]}, ${neovimCursor[1]}]`,
                    );
                    const finalLine = neovimCursor[0] - 1;
                    let finalCol = neovimCursor[1];
                    try {
                        finalCol = calculateEditorColFromVimScreenCol(
                            doc.lineAt(finalLine).text,
                            neovimCursor[1],
                            1,
                            true,
                        );
                        this.logger.debug(`${LOG_PREFIX}: Adjusted cursor: [${finalLine}, ${finalCol}]`);
                    } catch (e) {
                        this.logger.warn(`${LOG_PREFIX}: Unable to get cursor pos for external buffer: ${id}`);
                    }
                    editor.selections = [new Selection(finalLine, finalCol, finalLine, finalCol)];
                }
            }, 1000);

            // ! must delay to get a time to switch buffer to other window, otherwise it will be closed
            // TODO: Hacky, but seems external buffers won't be much often used
            setTimeout(() => {
                this.logger.debug(`${LOG_PREFIX}: Closing window ${closeWinId} for external buffer: ${id}`);
                try {
                    this.client.request("nvim_win_close", [closeWinId, true]);
                } catch (e) {
                    this.logger.warn(
                        `${LOG_PREFIX}: Closing the window: ${closeWinId} for external buffer failed: ${e.message}`,
                    );
                }
            }, 5000);
        }
    }
}
