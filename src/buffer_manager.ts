import path from "path";

import { debounce } from "lodash";
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
import { ManualPromise, convertByteNumToCharNum, disposeAll, fileExists, wait } from "./utils";

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
     * Promise for other modules to wait for layout synchronization.
     * Set this before running the debounced function, since layout is outdated.
     */
    private syncLayoutPromise?: ManualPromise;
    /**
     * Cancels sync operations to avoid using outdated data
     */
    private syncLayoutSource?: CancellationTokenSource;
    /**
     * Indicates if synchronization is in progress.
     * Make sure there is only one sync operation at a time.
     */
    private isSyncingLayout = false;
    /**
     * Indicates if the layout is outdated
     */
    private isLayoutOutdated = false;

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
            workspace.onDidSaveTextDocument(() => this.syncDocumentDirtyState()),
            window.onDidChangeTextEditorOptions((e) => this.onDidChangeEditorOptions(e.textEditor)),
            workspace.registerTextDocumentContentProvider(BUFFER_SCHEME, this.bufferProvider),
            eventBus.on("redraw", this.handleRedraw, this),
            eventBus.on("open-file", this.handleOpenFile, this),
            eventBus.on("external-buffer", this.handleExternalBuffer, this),
            eventBus.on("window-changed", ([winId]) => this.handleWindowChangedDebounced(winId)),
            eventBus.on("BufModifiedSet", ([data]) => this.handleBufferModifiedSet(data)),
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
                const editor = window.visibleTextEditors.find((e) => e.document === doc);
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

        actions.add("save_buffer", (data) => this.handleSaveBuf(data));
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }

    public async forceSyncLayout(): Promise<void> {
        logger.debug(`force syncing layout`);
        return this.onEditorLayoutChanged();
    }

    public async waitForLayoutSync(): Promise<void> {
        return this.syncLayoutPromise?.promise;
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
                if (!(await fileExists(uri))) {
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
        const uri = targetEditor.document.uri;
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

    private async syncDocumentDirtyState(): Promise<void> {
        const states = Array.from(this.textDocumentToBufferId.entries()).map(([doc, bufId]) => ({
            buf: bufId,
            modified: doc.isDirty,
        }));
        await this.client.lua(
            `
            local states = ...
            for _, state in ipairs(states) do
                vim.bo[state.buf].modified = state.modified
            end
            `,
            [states],
        );
    }

    // #247
    private handleBufferModifiedSet({ buf, modified }: EventBusData<"BufModifiedSet">[0]) {
        if (modified) return; // expected and we can't do anything about it
        const doc = this.getTextDocumentForBufferId(buf);
        if (doc && doc.isDirty && !doc.isUntitled && !doc.isClosed) {
            doc.save();
        }
    }

    private async handleSaveBuf({
        buf,
        bang,
        current_name,
        target_name,
    }: {
        buf: number;
        bang: boolean;
        current_name: string;
        target_name: string;
    }) {
        // Note:
        // 1. The approach here is to compute a generic relative file path using
        //    Vim's data first, then integrate it with VSCode's working directory.
        //    - Compute the relative-path using vim-target-filepath and vim-cwd.
        //    - Compute the vscode-target-filepath using this relative-path and vscode-cwd.
        //
        // 2. workspace.save and workspace.saveAs are smart enough to handle the
        //    documents that are not a real file (e.g. untitled, output, etc.)
        //    so we can just call them directly

        const document = this.getTextDocumentForBufferId(buf);
        if (document == null) {
            throw new Error(`Cannot save buffer ${buf} - ${target_name}`);
        }

        const docUri = document.uri;

        if (document.isUntitled) {
            await workspace.save(docUri);
            return;
        }

        // If using Windows locally and developing on a Unix remote environment,
        // the saved path can contain backslashes, causing folders to be treated as filenames.
        const normalize = (p: string) => path.normalize(p).split(path.sep).join(path.posix.sep);

        const currentPath = normalize(current_name);
        const targetPath = normalize(target_name);

        if (currentPath === targetPath) {
            await workspace.save(docUri);
            return;
        }

        const vimCwd = normalize(await this.main.client.call("getcwd"));
        const relativePath = normalize(path.relative(vimCwd, targetPath));

        if (relativePath === targetPath) {
            // Who wanna do this rare thing?
            // e.g. cwd: c:/a, target: d:/b.txt
            await workspace.saveAs(docUri);
            return;
        }

        const workspaceFolder = workspace.getWorkspaceFolder(docUri);
        if (!workspaceFolder) {
            // Let the user choose the save location
            // Otherwise, we would have to do too much guessing
            await workspace.saveAs(docUri);
            return;
        }
        const saveUri = Uri.joinPath(workspaceFolder.uri, relativePath);
        if ((await fileExists(saveUri)) && !bang) {
            // When will this be reached?
            // In remote development with Nvim running locally
            // Nvim can't detect if the file exists, so the user might not be able to use "!"
            const ret = await window.showErrorMessage(`File exists (add ! to override): ${saveUri.fsPath}`, "Override");
            if (ret !== "Override") {
                return;
            }
        }

        logger.debug(`Saving ${docUri} to ${saveUri}`);

        const text = document.getText();
        const bytes = new TextEncoder().encode(text);
        await workspace.fs.writeFile(saveUri, bytes);
        const doc = await workspace.openTextDocument(saveUri);
        await window.showTextDocument(doc);
    }

    // #region Sync layout

    private onEditorLayoutChanged = async () => {
        this.syncLayoutPromise = this.syncLayoutPromise ?? new ManualPromise();
        this.isLayoutOutdated = true;
        this.syncLayoutSource?.cancel();
        this.syncLayoutSource = new CancellationTokenSource();
        if (!this.isSyncingLayout) {
            await this.syncEditorLayoutDebounced();
        }
    };

    private syncEditorLayout = async (): Promise<void> => {
        this.isSyncingLayout = true;
        try {
            while (this.isLayoutOutdated) {
                this.isLayoutOutdated = false;
                const token = this.syncLayoutSource?.token;

                const visibleEditors = [...window.visibleTextEditors];
                const activeEditor = window.activeTextEditor;

                if (token?.isCancellationRequested) continue;
                await this.cleanupWindowsAndBuffers(visibleEditors);

                if (token?.isCancellationRequested) continue;
                await this.syncVisibleEditors(visibleEditors);

                if (token?.isCancellationRequested) continue;
                await this.syncActiveEditor(activeEditor);
            }
        } catch (e) {
            logger.error("Error syncing layout:", e);
        } finally {
            this.isSyncingLayout = false;
            this.syncLayoutPromise?.resolve();
            this.syncLayoutPromise = undefined;
        }
    };

    private syncEditorLayoutDebounced = debounce(this.syncEditorLayout, 100, { leading: false, trailing: true });

    private async cleanupWindowsAndBuffers(visibleEditors: TextEditor[]): Promise<void> {
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

    private async syncVisibleEditors(visibleEditors: TextEditor[]): Promise<void> {
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

    private async syncActiveEditor(activeEditor?: TextEditor): Promise<void> {
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
        logger.log(document.uri, LogLevel.Debug, `Init buffer for ${bufId}, doc: ${document.uri}`);

        const eol = document.eol === EndOfLine.LF ? "\n" : "\r\n";
        const lines = document.getText().split(eol);
        const bufname = await this.bufnameForTextDocument(document);

        await actions.lua("init_document_buffer", {
            buf: bufId,
            bufname: bufname,
            lines: lines,
            uri: document.uri.toString(),
            uri_data: document.uri.toJSON(),
            editor_options: makeEditorOptionsVariable(editor?.options),
            modifiable: !this.isExternalTextDocument(document),
            modified: document.isDirty,
        });

        // Looks like need to be in separate request
        if (!this.isExternalTextDocument(document)) {
            await actions.lua("clear_undo", bufId);
        }
        this.onBufferInit?.(bufId, document);
        buffer.listen("lines", this.receivedBufferEvent);
        actions.fireNvimEvent("document_buffer_init", bufId);
    }

    private async bufnameForTextDocument(doc: TextDocument): Promise<string> {
        const uri = doc.uri;
        if (uri.scheme === "file") {
            return config.useWsl ? actions.lua<string>("wslpath", uri.fsPath) : uri.fsPath;
        }
        // We don't care about the name of the buffer if it's not a file
        return uri.toString();
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
