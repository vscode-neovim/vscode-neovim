import path from "path";

import { debounce } from "lodash-es";
import { Buffer, NeovimClient } from "neovim";
import { ATTACH } from "neovim/lib/api/Buffer";
import {
    CancellationToken,
    CancellationTokenSource,
    Disposable,
    EndOfLine,
    EventEmitter,
    LogLevel,
    NotebookDocument,
    Selection,
    TextDocument,
    TextDocumentContentProvider,
    TextEditor,
    TextEditorLineNumbersStyle,
    TextEditorOptions,
    TextEditorRevealType,
    Uri,
    ViewColumn,
    commands,
    window,
    workspace,
} from "vscode";

import actions from "./actions";
import { config } from "./config";
import { EventBusData, eventBus } from "./eventBus";
import { createLogger } from "./logger";
import { MainController } from "./main_controller";
import { ManualPromise, convertByteNumToCharNum, disposeAll, wait } from "./utils";

// NOTE: document and editors in vscode events and namespace are reference stable
// Integration notes:
// 1. Each document corresponds to a buffer
// 2. Each editor corresponds to a window
// 3. Generally, an editor corresponds to a document, so the buffer and window in neovim have a one-to-one relationship
// 4. When visibleTextEditors change => create a buffer and window in neovim
// 5. When activeTextEditor changes => set the current window in neovim

const logger = createLogger("BufferManager");

const BUFFER_SCHEME = "vscode-neovim";

function makeEditorOptionsVariable(options?: TextEditorOptions) {
    if (!options) {
        const editorConfig = workspace.getConfiguration("editor");
        const tabSize = editorConfig.get<number>("tabSize")!;
        const insertSpaces = editorConfig.get<boolean>("insertSpaces")!;
        const lineNumbers = editorConfig.get<"on" | "off" | "relative" | "interval">("lineNumbers")!;
        return { tabSize, insertSpaces, lineNumbers };
    }
    const { tabSize, insertSpaces, lineNumbers } = options;
    return {
        tabSize,
        insertSpaces,
        lineNumbers: {
            [TextEditorLineNumbersStyle.On]: "on",
            [TextEditorLineNumbersStyle.Off]: "off",
            [TextEditorLineNumbersStyle.Relative]: "relative",
            [TextEditorLineNumbersStyle.Interval]: "interval",
        }[lineNumbers as TextEditorLineNumbersStyle],
    };
}

/**
 * Manages neovim windows & buffers and maps them to vscode editors & documents
 */
export class BufferManager implements Disposable {
    private disposables: Disposable[] = [];
    /**
     * Internal sync promise
     */
    private syncEditorLayoutPromise?: ManualPromise;
    private syncEditorLayoutSource?: CancellationTokenSource;
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
     * Provider for external buffers' document contents (e.g. `:help`)
     */
    private bufferProvider: BufferProvider;

    private editorOptionsChangedTimers: WeakMap<TextEditor, NodeJS.Timeout> = new WeakMap();

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

    private get client() {
        return this.main.client;
    }

    public constructor(private main: MainController) {
        this.bufferProvider = new BufferProvider(this.client, this.receivedBufferEvent);
        this.disposables.push(
            window.onDidChangeVisibleTextEditors(this.onEditorLayoutChanged),
            window.onDidChangeActiveTextEditor(this.onEditorLayoutChanged),
            workspace.onDidCloseTextDocument(this.onEditorLayoutChanged),
            workspace.onDidCloseNotebookDocument(this.onEditorLayoutChanged),
            window.onDidChangeTextEditorOptions((e) => this.onDidChangeEditorOptions(e.textEditor)),
            workspace.registerTextDocumentContentProvider(BUFFER_SCHEME, this.bufferProvider),
            eventBus.on("redraw", this.handleRedraw, this),
            eventBus.on("open-file", this.handleOpenFile, this),
            eventBus.on("external-buffer", this.handleExternalBuffer, this),
            eventBus.on("window-changed", ([winId]) => this.handleWindowChangedDebounced(winId)),
        );
        actions.add(
            "set_editor_options",
            (
                bufId: number,
                options: {
                    tabSize: number;
                    insertSpaces: boolean;
                    lineNumbers: "on" | "off" | "relative";
                },
            ) => {
                const [doc] = [...this.textDocumentToBufferId.entries()].find(([_, id]) => id === bufId) || [];
                if (!doc) return;
                const editor = window.visibleTextEditors.find((e) => e.document == doc);
                if (!editor) return;
                const { tabSize, insertSpaces, lineNumbers: numbers } = options;
                const lineNumbers =
                    numbers === "off"
                        ? TextEditorLineNumbersStyle.Off
                        : numbers === "on"
                          ? TextEditorLineNumbersStyle.On
                          : TextEditorLineNumbersStyle.Relative;
                editor.options = { tabSize, insertSpaces, lineNumbers };
            },
        );
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }

    public async forceSyncLayout(): Promise<void> {
        logger.debug(`force syncing layout`);
        return this.onEditorLayoutChanged();
    }

    public async waitForLayoutSync(): Promise<void> {
        return this.syncEditorLayoutPromise?.promise;
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

    private handleRedraw({ name, args }: EventBusData<"redraw">) {
        switch (name) {
            case "win_external_pos":
            case "win_pos": {
                for (const [grid, win] of args) {
                    this.grids.set(grid, { winId: win.id });
                }
                break;
            }
            case "win_close": {
                for (const [grid] of args) {
                    this.grids.delete(grid);
                }
                break;
            }
        }
    }

    private async handleOpenFile(data: EventBusData<"open-file">) {
        const [fileName, close] = data;
        const currEditor = window.activeTextEditor;
        let doc: NotebookDocument | TextDocument | undefined;
        try {
            if (fileName === "__vscode_new__") {
                doc = await workspace.openTextDocument();
            } else {
                const normalizedName = fileName.trim();
                let uri = Uri.from({ scheme: "file", path: this.findPathFromFileName(normalizedName) });
                try {
                    await workspace.fs.stat(uri);
                } catch {
                    uri = Uri.from({ scheme: "untitled", path: normalizedName });
                    // Why notebook?
                    // Limitations with TextDocument, specifically when there is no active
                    // workspace. openNotebookDocument prompts for a file path when the
                    // document is saved and while it returns a NotebookDocument it can
                    // still be used as a TextDocument
                    // https://github.com/microsoft/vscode/issues/197836
                    doc = await workspace.openNotebookDocument(uri);
                }
                doc ??= await workspace.openTextDocument(uri);
            }
        } catch (error) {
            logger.log(doc?.uri, LogLevel.Error, `Error opening file ${fileName}, ${error}`);
        }
        if (!doc) {
            return;
        }
        let viewColumn: ViewColumn | undefined;
        if (close && close !== "all" && currEditor) {
            viewColumn = currEditor.viewColumn;
            await commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
        }
        await window.showTextDocument(<TextDocument>doc, viewColumn);
        if (close === "all") {
            await commands.executeCommand("workbench.action.closeOtherEditors");
        }
    }

    private async handleExternalBuffer(data: EventBusData<"external-buffer">) {
        const [bufferInfo, expandTab, tabStop] = data;
        const {
            name,
            bufnr,
            variables: { vscode_uri },
        } = bufferInfo;

        if (!vscode_uri) {
            logger.debug(`Attaching new external buffer: '${name}', id: ${bufnr}`);
            if (bufnr === 1) {
                logger.debug(`${bufnr} is the first neovim buffer, skipping`);
                return;
            }
            await this.attachNeovimExternalBuffer(name, bufnr, !!expandTab, tabStop);
            return;
        }

        const uri = Uri.parse(vscode_uri, true);
        logger.log(uri, LogLevel.Debug, `Buffer request for ${uri.fsPath}, bufId: ${bufnr}`);
        try {
            let doc = this.findDocFromUri(uri.toString());
            if (!doc) {
                logger.log(uri, LogLevel.Debug, `Opening a doc: ${uri.fsPath}`);
                doc = await workspace.openTextDocument(uri);
            }
            if (!this.textDocumentToBufferId.has(doc)) {
                logger.log(
                    uri,
                    LogLevel.Debug,
                    `No doc -> buffer mapping exists, assigning mapping and init buffer options`,
                );
                const buffers = await this.client.buffers;
                const buf = buffers.find((b) => b.id === bufnr);
                if (buf) {
                    await this.initBufferForDocument(doc, buf);
                }
                this.textDocumentToBufferId.set(doc, bufnr);
            }
            if (window.activeTextEditor?.document !== doc) {
                const editor = await window.showTextDocument(doc, {
                    // viewColumn: vscode.ViewColumn.Active,
                    // !need to force editor to appear in the same column even if vscode 'revealIfOpen' setting is true
                    viewColumn: window.activeTextEditor ? window.activeTextEditor.viewColumn : ViewColumn.Active,
                    preserveFocus: false,
                    preview: false,
                });
                // force resync
                this.onDidChangeEditorOptions(editor);
            }
        } catch {
            // todo: show error
        }
    }

    private handleWindowChanged = async (winId: number): Promise<void> => {
        logger.debug(`window changed, target window id: ${winId}`);
        if (winId === 1000) {
            // This event is triggered by our layout sync, skip it
            logger.debug("window id is 1000, skipping");
            return;
        }

        const returnToActiveEditor = async () => {
            const e = window.activeTextEditor;
            if (e) await window.showTextDocument(e.document, e.viewColumn);
        };

        let targetEditor = this.getEditorFromWinId(winId);
        if (!targetEditor) {
            logger.debug(`target editor not found <check 1>, return to active editor`);
            return returnToActiveEditor();
        }
        let uri = targetEditor.document?.uri;
        const workspaceFolder = uri && workspace.getWorkspaceFolder(uri);
        if(workspaceFolder) {
            await this.client.request("nvim_set_current_dir", [workspaceFolder.uri.fsPath]);
        }
        if (window.activeTextEditor === targetEditor) return;
        // since the event could be triggered by vscode side operations
        // we need to wait a bit to let vscode finish its internal operations
        // then check if the target editor is still the same
        await wait(50);
        await this.waitForLayoutSync();
        // triggered by vscode side operations
        if (window.activeTextEditor === undefined) {
            // e.g. open settings, open keyboard shortcuts settings which overrides active editor
            logger.debug(`activeTextEditor is undefined, skipping`);
            return;
        }
        await this.main.cursorManager.waitForCursorUpdate(window.activeTextEditor);
        const { id: curwin } = await this.client.getWindow();
        targetEditor = this.getEditorFromWinId(curwin);
        if (!targetEditor) {
            logger.debug(`target editor not found <check 2>, return to active editor`);
            return returnToActiveEditor();
        }
        if (window.activeTextEditor === targetEditor) return;
        await this.main.cursorManager.waitForCursorUpdate(targetEditor);
        uri = targetEditor.document.uri;
        const { scheme } = uri;
        switch (scheme) {
            case "output": {
                await commands.executeCommand("workbench.panel.output.focus");
                return;
            }

            case "vscode-notebook-cell": {
                const targetNotebook = window.visibleNotebookEditors.find((e) => e.notebook.uri.fsPath === uri.fsPath);
                if (targetNotebook) {
                    // 1. jump to target notebook
                    await window.showTextDocument(targetEditor.document, targetNotebook.viewColumn);
                    // wait a bit to let vscode finish its internal operations
                    await wait(50);
                    // 2. jump to target cell
                    await window.showTextDocument(targetEditor.document, targetEditor.viewColumn);
                    return;
                }
                break;
            }

            default: {
                await window.showTextDocument(targetEditor.document, targetEditor.viewColumn);
                return;
            }
        }

        // Should not happen
        await returnToActiveEditor();
    };

    private handleWindowChangedDebounced = debounce(this.handleWindowChanged, 100, { leading: false, trailing: true });

    // #region Sync layout

    private onEditorLayoutChanged = async () => {
        if (!this.syncEditorLayoutPromise) {
            this.syncEditorLayoutPromise = new ManualPromise();
        }
        this.syncEditorLayoutSource?.cancel();
        this.syncEditorLayoutSource = new CancellationTokenSource();
        await this.syncEditorLayoutDebounced(this.syncEditorLayoutSource.token);
    };

    private syncEditorLayout = async (cancelToken: CancellationToken): Promise<void> => {
        await this.cleanupWindowsAndBuffers();
        if (cancelToken.isCancellationRequested) {
            logger.debug(`Sync layout cancelled - syncVisibleEditors`);
            return;
        }
        await this.syncVisibleEditors();
        if (cancelToken.isCancellationRequested) {
            logger.debug(`Sync layout cancelled - syncActiveEditor`);
            return;
        }
        await this.syncActiveEditor();
        if (cancelToken.isCancellationRequested) {
            logger.debug(`Sync layout cancelled - resolve`);
            return;
        }
        this.syncEditorLayoutPromise?.resolve();
        this.syncEditorLayoutPromise = undefined;
    };

    private syncEditorLayoutDebounced = debounce(this.syncEditorLayout, 100, { leading: false, trailing: true });

    private async cleanupWindowsAndBuffers(): Promise<void> {
        // store in copy, just in case
        const visibleEditors = [...window.visibleTextEditors];

        const unusedWindows: number[] = [];
        const unusedBuffers: number[] = [];
        // close windows
        [...this.textEditorToWinId.entries()].forEach(([editor, winId]) => {
            if (visibleEditors.includes(editor)) return;
            logger.debug(`Editor viewColumn: ${editor.viewColumn}, winId: ${winId}, closing`);
            this.textEditorToWinId.delete(editor);
            this.winIdToEditor.delete(winId);
            unusedWindows.push(winId);
        });
        // delete buffers
        [...this.textDocumentToBufferId.entries()].forEach(([document, bufId]) => {
            if (!document.isClosed) return;
            if (visibleEditors.some((editor) => editor.document === document)) return;
            logger.debug(`Document: ${document.uri}, bufId: ${bufId}, deleting`);
            this.textDocumentToBufferId.delete(document);
            unusedBuffers.push(bufId);
        });
        unusedWindows.length && (await actions.lua("close_windows", unusedWindows));
        unusedBuffers.length && (await actions.lua("delete_buffers", unusedBuffers));
    }

    private async syncVisibleEditors(): Promise<void> {
        const visibleEditors = [...window.visibleTextEditors];
        // Open/change neovim windows
        for (const editor of visibleEditors) {
            const { document: doc } = editor;
            logger.log(doc.uri, LogLevel.Debug, `Visible editor, viewColumn: ${editor.viewColumn}, doc: ${doc.uri}`);
            // create buffer first if not known to the system
            // creating initially not listed buffer to prevent firing autocmd events when
            // buffer name/lines are not yet set. We'll set buflisted after setup
            if (!this.textDocumentToBufferId.has(doc)) {
                logger.log(doc.uri, LogLevel.Debug, `Document not known, init in neovim`);
                const buf = await this.client.createBuffer(false, true);
                if (typeof buf === "number") {
                    logger.error(`Cannot create a buffer, code: ${buf}`);
                    continue;
                }
                await this.initBufferForDocument(doc, buf, editor);

                logger.log(doc.uri, LogLevel.Debug, `Document: ${doc.uri}, BufId: ${buf.id}`);
                this.textDocumentToBufferId.set(doc, buf.id);
            }
            if (this.textEditorToWinId.has(editor)) continue;
            const editorBufferId = this.textDocumentToBufferId.get(doc)!;
            try {
                logger.log(
                    doc.uri,
                    LogLevel.Debug,
                    `Creating new window for ${editor.viewColumn} column (undefined is OK here)`,
                );
                const winId = await this.createNeovimWindow(editorBufferId);
                logger.log(doc.uri, LogLevel.Debug, `Created new window: ${winId} ViewColumn: ${editor.viewColumn}`);
                this.textEditorToWinId.set(editor, winId);
                this.winIdToEditor.set(winId, editor);
                await this.main.cursorManager.updateNeovimCursorPosition(editor, editor.selection.active);
            } catch (e) {
                logger.log(doc.uri, LogLevel.Error, (e as Error).message);
            }
        }
    }

    private async syncActiveEditor(): Promise<void> {
        const activeEditor = window.activeTextEditor;
        if (!activeEditor) return;
        const winId = this.textEditorToWinId.get(activeEditor);
        const uri = activeEditor.document.uri;
        if (!winId) {
            // If we reach here, then the current window in Neovim is out of sync with the
            // active editor, which manifests itself as the editor being completely unresponsive
            // when in normal mode
            logger.log(
                uri,
                LogLevel.Error,
                `Unable to determine neovim window id for editor, viewColumn: ${activeEditor.viewColumn}, docUri: ${uri}`,
            );
            return;
        }
        if ((await this.client.window).id === winId) return;
        logger.log(
            uri,
            LogLevel.Debug,
            `Setting active editor - viewColumn: ${activeEditor.viewColumn}, winId: ${winId}`,
        );
        await this.main.cursorManager.updateNeovimCursorPosition(activeEditor, activeEditor.selection.active);
        if (this.main.modeManager.isVisualMode) {
            // https://github.com/vscode-neovim/vscode-neovim/issues/1577
            logger.log(
                uri,
                LogLevel.Debug,
                `Cancel visual mode to prevent selection from previous editor to carry over to active editor`,
            );
            await this.client.input("<Esc>");
        }
        try {
            await this.client.request("nvim_set_current_win", [winId]);
        } catch (e) {
            logger.log(uri, LogLevel.Error, (e as Error).message);
        }
    }
    // #endregion

    private onDidChangeEditorOptions = (editor: TextEditor): void => {
        // Debounce, ensure sending the latest options.
        let timer = this.editorOptionsChangedTimers.get(editor);
        clearTimeout(timer);
        timer = setTimeout(() => {
            const bufId = this.textDocumentToBufferId.get(editor.document);
            if (bufId) {
                actions.fireNvimEvent("editor_options_changed", bufId, makeEditorOptionsVariable(editor.options));
            }
        }, 50);
        this.editorOptionsChangedTimers.set(editor, timer);
    };

    private receivedBufferEvent = (
        buffer: Buffer,
        tick: number,
        firstLine: number,
        lastLine: number,
        linedata: string[],
        more: boolean,
    ): void => {
        this.onBufferEvent?.(buffer.id, tick, firstLine, lastLine, linedata, more);
        // Ensure the receivedBufferEvent callback finishes before we fire
        // the event notifying the doc provider of any changes
        (async () => {
            const uri = this.buildExternalBufferUri(await buffer.name, buffer.id);
            logger.log(uri, LogLevel.Debug, `received buffer event for ${uri}`);
            this.bufferProvider.documentDidChange.fire(uri);
            return uri;
        })().then(undefined, (e) => {
            logger.log(undefined, LogLevel.Error, `failed to notify document change: ${e}`);
        });
    };

    /**
     * Set buffer options from vscode document
     */
    private async initBufferForDocument(document: TextDocument, buffer: Buffer, editor?: TextEditor): Promise<void> {
        const bufId = buffer.id;
        const { uri: docUri } = document;
        logger.log(docUri, LogLevel.Debug, `Init buffer for ${bufId}, doc: ${docUri}`);

        const eol = document.eol === EndOfLine.LF ? "\n" : "\r\n";
        const lines = document.getText().split(eol);
        // We don't care about the name of the buffer if it's not a file
        const bufname =
            docUri.scheme === "file"
                ? config.useWsl
                    ? await actions.lua("wslpath", docUri.fsPath)
                    : docUri.fsPath
                : docUri.toString();

        await this.client.lua(
            `
            local bufId, lines, vscode_editor_options, docUri, docUriJson, bufname, isExternalDoc = ...
            vim.api.nvim_buf_set_lines(bufId, 0, -1, false, lines)
            -- set vscode controlled flag so we can check it neovim
            vim.api.nvim_buf_set_var(bufId, "vscode_controlled", true)
            -- In vscode same document can have different insertSpaces/tabSize settings per editor
            -- however in neovim it's per buffer. We make assumption here that these settings are same for all editors
            vim.api.nvim_buf_set_var(bufId, "vscode_editor_options", vscode_editor_options)
            vim.api.nvim_buf_set_var(bufId, "vscode_uri", docUri)
            vim.api.nvim_buf_set_var(bufId, "vscode_uri_data", docUriJson)
            vim.api.nvim_buf_set_name(bufId, bufname)
            vim.api.nvim_buf_set_option(bufId, "modifiable", not isExternalDoc)
            -- force nofile, just in case if the buffer was created externally
            vim.api.nvim_buf_set_option(bufId, "buftype", "nofile")
            vim.api.nvim_buf_set_option(bufId, "buflisted", true)
        `,
            [
                bufId,
                lines,
                makeEditorOptionsVariable(editor?.options),
                docUri.toString(),
                docUri.toJSON(),
                bufname,
                this.isExternalTextDocument(document),
            ],
        );

        // Looks like need to be in separate request
        if (!this.isExternalTextDocument(document)) {
            await this.client.callFunction("VSCodeClearUndo", bufId);
        }
        this.onBufferInit?.(bufId, document);
        buffer.listen("lines", this.receivedBufferEvent);
        actions.fireNvimEvent("document_buffer_init", bufId);
    }

    /**
     * Create new neovim window
     */
    private async createNeovimWindow(bufId: number): Promise<number> {
        await this.client.setOption("eventignore", "BufWinEnter,BufEnter,BufLeave");
        const win = await this.client.openWindow(bufId as any, false, {
            external: true,
            width: config.neovimViewportWidth,
            height: 100,
        });
        await this.client.setOption("eventignore", "");
        if (typeof win === "number") {
            throw new Error(`Unable to create a new neovim window, code: ${win}`);
        }
        return win.id;
    }

    private findPathFromFileName(name: string): string {
        const folders = workspace.workspaceFolders;
        return folders && folders.length > 0 ? path.resolve(folders[0].uri.fsPath, name) : name;
    }

    private findDocFromUri(uri: string): TextDocument | undefined {
        if (uri.startsWith("/search-editor")) {
            uri = uri.slice(1);
        }
        return workspace.textDocuments.find((d) => d.uri.toString() === uri);
    }

    private buildExternalBufferUri(name: string, id: number): Uri {
        // These might not *always* be file names, but they often are (e.g. for :help) so
        // make sure we properly convert slashes for the path component, especially on Windows
        return Uri.file(name).with({ scheme: BUFFER_SCHEME, authority: id.toString() });
    }

    private async attachNeovimExternalBuffer(
        name: string,
        id: number,
        expandTab: boolean,
        tabStop: number,
    ): Promise<void> {
        const uri = this.buildExternalBufferUri(name, id);
        logger.debug(`opening external buffer ${uri}`);

        let doc: TextDocument;
        try {
            doc = await workspace.openTextDocument(uri);
        } catch (error) {
            logger.debug(`unable to open external buffer: ${error}`);
            return;
        }

        this.externalTextDocuments.add(doc);
        this.textDocumentToBufferId.set(doc, id);
        this.onBufferInit?.(id, doc);

        const windows = await this.client.windows;
        let closeWinId = 0;
        for (const window of windows) {
            const buf = await window.buffer;
            if (buf.id === id) {
                logger.debug(
                    `Found window assigned to external buffer ${id}, winId: ${
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
        editor.options.insertSpaces = expandTab;
        editor.options.tabSize = tabStop;

        if (closeWinId) {
            // !Another hack is to retrieve cursor with delay - when we receive an external buffer the cursor pos is not immediately available
            // [1, 0]
            setTimeout(async () => {
                const neovimCursor: [number, number] = await this.client.request("nvim_win_get_cursor", [closeWinId]);
                if (neovimCursor) {
                    logger.debug(
                        `Adjusting cursor pos for external buffer: ${id}, originalPos: [${neovimCursor[0]}, ${neovimCursor[1]}]`,
                    );
                    const finalLine = neovimCursor[0] - 1;
                    let finalCol = neovimCursor[1];
                    try {
                        finalCol = convertByteNumToCharNum(doc.lineAt(finalLine).text, neovimCursor[1]);
                        logger.debug(`Adjusted cursor: [${finalLine}, ${finalCol}]`);
                    } catch (e) {
                        logger.warn(`Unable to get cursor pos for external buffer: ${id}`);
                    }

                    const selection = new Selection(finalLine, finalCol, finalLine, finalCol);
                    editor.selections = [selection];
                    editor.revealRange(selection, TextEditorRevealType.AtTop);
                }
            }, 1000);

            // ! must delay to get a time to switch buffer to other window, otherwise it will be closed
            // TODO: Hacky, but seems external buffers won't be much often used
            setTimeout(() => {
                logger.debug(`Closing window ${closeWinId} for external buffer: ${id}`);
                try {
                    this.client.request("nvim_win_close", [closeWinId, true]);
                } catch (e) {
                    logger.warn(
                        `Closing the window: ${closeWinId} for external buffer failed: ${(e as Error).message}`,
                    );
                }
            }, 5000);
        }
    }
}

/**
 * Implements the VSCode document provider API for external buffers from neovim.
 */
class BufferProvider implements TextDocumentContentProvider {
    /**
     * Fire this event to update the document contents (i.e. re-evaluate the provider).
     */
    public documentDidChange: EventEmitter<Uri> = new EventEmitter();

    onDidChange = this.documentDidChange.event;

    public constructor(
        private client: NeovimClient,
        private receivedBufferEvent: BufferManager["receivedBufferEvent"],
    ) {}

    async provideTextDocumentContent(uri: Uri, token: CancellationToken): Promise<string | undefined> {
        logger.debug(`trying to provide content for ${uri}`);

        const id = parseInt(uri.authority, 10);

        const buffers = await this.client.buffers;
        const buf = buffers.find((b) => b.id === id);
        if (!buf || token.isCancellationRequested) {
            logger.debug(`external buffer ${id} not found`);
            return;
        }

        // don't bother with displaying empty buffer
        const lines = await buf.lines;
        if (!lines.length || (lines.length === 1 && !lines[0])) {
            logger.debug(`Skipping empty external buffer ${id}`);
            return;
        }

        buf.listen("lines", this.receivedBufferEvent);
        await buf[ATTACH](true);

        return lines.join("\n");
    }
}
