import { spawn, ChildProcess } from "child_process";
import path from "path";

import vscode from "vscode";
import { attach, Buffer as NeovimBuffer, NeovimClient, Window } from "neovim";
import { VimValue } from "neovim/lib/types/VimValue";
import { ATTACH } from "neovim/lib/api/Buffer";

import { CommandLineController } from "./command_line";
import { StatusLineController } from "./status_line";
import { HighlightProvider, HighlightConfiguration } from "./highlight_provider";
import { CommandsController } from "./commands_controller";

interface CursorMode {
    /**
     * Cursor attribute id (defined by `hl_attr_define`)
     */
    attrId: number;
    /**
     * Cursor attribute id for when 'langmap' is active.
     */
    attrIdLm: number;
    /**
     * Time that the cursor is not shown.
     * When one of the numbers is zero, there is no blinking
     */
    blinkOff: number;
    /**
     * Time that the cursor is shown
     * When one of the numbers is zero, there is no blinking
     */
    blinkOn: number;
    /**
     * Delay before the cursor starts blinking
     * When one of the numbers is zero, there is no blinking
     */
    blinkWait: number;
    /**
     * Cell % occupied by the cursor.
     */
    cellPercentage: number;
    /**
     * Cursor shape
     */
    cursorShape: "block" | "horizontal" | "vertical";
    mouseShape: number;
    name: string;
    shortName: string;
}

interface OtherMode {
    mouseShape: number;
    name: string;
    shortName: string;
}

interface RequestResponse {
    send(resp: unknown, isError?: boolean): void;
}

interface RedrawHighlightsUpdates {
    [key: string]: { [key: string]: string | "remove" };
}

interface DocumentChange {
    start: number;
    end: number;
    newStart: number;
    newEnd: number;
    version: number;
}

// to not deal with screenrow positioning, we set height to high value and scrolloff to value / 2. so screenrow will be always constant
// big scrolloff is needed to make sure that editor visible space will be always within virtual vim boundaries, regardless of current
// cursor positioning
const NVIM_WIN_HEIGHT = 201;
const NVIM_WIN_WIDTH = 500;

export class NVIMPluginController implements vscode.Disposable {
    private isInsertMode = false;
    /**
     * Current vim mode
     */
    private currentModeName = "";
    /**
     * Special flag to leave multiple cursors produced by visual line/visual block mode after
     * exiting visual mode. Being set by RPC request
     */
    private leaveMultipleCursorsForVisualMode = false;

    private nvimProc: ChildProcess;
    private client: NeovimClient;

    private disposables: vscode.Disposable[] = [];
    private typeHandlerDisplose?: vscode.Disposable;
    /**
     * Enable visual mode selection by mouse
     */
    private mouseSelectionEnabled = false;
    /**
     * All buffers ids originated from vscode
     */
    private managedBufferIds: Set<number> = new Set();
    /**
     * Map of pending buffers which should become managed by vscode buffers. These are usually coming from jumplist
     * Since vim already created buffer for it, we must reuse it instead of creating new one
     */
    private pendingBuffers: Map<string, number> = new Map();
    /**
     * Vscode uri string -> buffer mapping
     */
    private uriToBuffer: Map<string, NeovimBuffer> = new Map();
    /**
     * Buffer id -> vscode uri mapping
     */
    private bufferIdToUri: Map<number, string> = new Map();
    /**
     * Skip buffer update from neovim with specified tick
     */
    private skipBufferTickUpdate: Map<number, number> = new Map();
    /**
     * Track last changed version. Used to skip neovim update when in insert mode
     */
    private documentLastChangedVersion: Map<string, number> = new Map();
    /**
     * Tracks changes in insert mode. We can send them to neovim immediately but this will break undo stack
     */
    private documentChangesInInsertMode: Map<string, DocumentChange[]> = new Map();
    /**
     * Vscode doesn't allow to apply multiple edits to the save document without awaiting previous reuslt.
     * So we'll accumulate neovim buffer updates here, then apply
     */
    private pendingBufChangesQueue: Array<{
        buffer: NeovimBuffer;
        firstLine: number;
        lastLine: number;
        data: string[];
        tick: number;
    }> = [];

    private bufQueuePromise?: Promise<void>;
    private resolveBufQueuePromise?: () => void;

    /**
     * Neovim API states that multiple redraw batches could be sent following flush() after last batch
     * Save current batch into temp variable
     */
    private currentRedrawBatch: [string, ...unknown[]][] = [];
    /**
     * Sync redraw batches queue
     */
    private redrawBatchQueue: [string, ...unknown[]][][] = [];
    private redrawBatchQueuePromise?: Promise<void>;
    private resolveRedrawBatchQueuePromise?: () => void;

    private commandsController: CommandsController;
    /**
     * Simple command line UI
     */
    private commandLine: CommandLineController;
    /**
     * Status var UI
     */
    private statusLine: StatusLineController;
    /**
     * Vim modes
     */
    private vimModes: Map<string, CursorMode | OtherMode> = new Map();
    private highlightProvider: HighlightProvider;

    private nvimAttachWaiter: Promise<void> = Promise.resolve();
    private isInit = false;

    private neovimExtensionsPath: string;

    /**
     * Special flag to ignore mouse selection and don't send cursor event to neovim. Used for vscode-range-command RPC commands
     */
    private shouldIgnoreMouseSelection = false;

    /**
     * When opening external buffers , like :PlugStatus they often comes with empty content and without name and receives text updates later
     * Don't want to clutter vscode by opening empty documents, so track them here and open only once when receiving some text
     */
    private externalBuffersShowOnNextChange: Set<number> = new Set();

    /**
     * Pending cursor update. Indicates that editor should drop all cursor updates from neovim until it got the one indicated in [number, number]
     * We set it when switching the active editor
     */
    private editorPendingCursor: WeakMap<
        vscode.TextEditor,
        { line: number; col: number; screenRow: number; totalSkips: number }
    > = new WeakMap();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private noEditorBuffer: NeovimBuffer = undefined as any;

    private editorColumnIdToWinId: Map<number, number> = new Map();

    private textEditorsRevealing: WeakMap<vscode.TextEditor, number> = new WeakMap();

    private grids: Map<
        number,
        { winId: number; cursorLine: number; cursorPos: number; screenLine: number }
    > = new Map();

    public constructor(
        neovimPath: string,
        extensionPath: string,
        highlightsConfiguration: HighlightConfiguration,
        mouseSelection: boolean,
    ) {
        if (!neovimPath) {
            throw new Error("Neovim path is not defined");
        }
        this.mouseSelectionEnabled = mouseSelection;
        this.highlightProvider = new HighlightProvider(highlightsConfiguration);
        this.neovimExtensionsPath = path.join(extensionPath, "vim", "vscode-neovim.vim");
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand));
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument));
        this.disposables.push(vscode.window.onDidChangeVisibleTextEditors(this.onChangedEdtiors));
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(this.onChangedActiveEditor));
        this.disposables.push(vscode.window.onDidChangeTextEditorSelection(this.onChangeSelection));
        // this.disposables.push(vscode.window.onDidChangeTextEditorVisibleRanges(this.onChangeVisibleRange));
        this.typeHandlerDisplose = vscode.commands.registerTextEditorCommand("type", this.onVSCodeType);

        this.disposables.push(
            vscode.commands.registerCommand("vscode-neovim.ctrl-f", () => this.scrollPage("page", "down")),
        );
        this.disposables.push(
            vscode.commands.registerCommand("vscode-neovim.ctrl-b", () => this.scrollPage("page", "up")),
        );
        this.disposables.push(
            vscode.commands.registerCommand("vscode-neovim.ctrl-d", () => this.scrollPage("halfPage", "down")),
        );
        this.disposables.push(
            vscode.commands.registerCommand("vscode-neovim.ctrl-u", () => this.scrollPage("halfPage", "up")),
        );
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-e", () => this.scrollLine("down")));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-y", () => this.scrollLine("up")));

        const args = ["-N", "--embed", "-c", `source ${this.neovimExtensionsPath}`];
        if (parseInt(process.env.NEOVIM_DEBUG || "", 10) === 1) {
            args.push(
                "-u",
                "NONE",
                "--listen",
                `${process.env.NEOVIM_DEBUG_HOST || "127.0.0.1"}:${process.env.NEOVIM_DEBUG_PORT || 4000}`,
            );
        }
        this.nvimProc = spawn(neovimPath, args, {});
        this.client = attach({ proc: this.nvimProc });
        this.commandLine = new CommandLineController();
        this.statusLine = new StatusLineController();
        this.commandsController = new CommandsController(this.client);
        this.commandLine.onAccepted = this.onCmdAccept;
        this.commandLine.onChanged = this.onCmdChange;
        this.commandLine.onCanceled = this.onCmdCancel;
        this.disposables.push(this.commandLine);
        this.disposables.push(this.statusLine);
        this.disposables.push(this.commandsController);

        this.client.on("notification", this.onNeovimNotification);
        this.client.on("request", this.handleCustomRequest);
    }

    public async init(): Promise<void> {
        await this.client.setClientInfo("vscode-neovim", { major: 0, minor: 1, patch: 0 }, "embedder", {}, {});
        const channel = await this.client.channelId;
        await this.client.setVar("vscode_channel", channel);

        this.nvimAttachWaiter = this.client.uiAttach(NVIM_WIN_WIDTH, NVIM_WIN_HEIGHT, {
            rgb: true,
            // override: true,
            /* eslint-disable @typescript-eslint/camelcase */
            ext_cmdline: true,
            ext_linegrid: true,
            ext_hlstate: true,
            ext_messages: true,
            ext_multigrid: true,
            ext_popupmenu: true,
            ext_tabline: true,
            ext_wildmenu: true,
            /* eslint-enable @typescript-eslint/camelcase */
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        await this.nvimAttachWaiter;

        // create empty buffer which is used when there is no active editor in the window
        const buf = await this.client.createBuffer(true, false);
        if (typeof buf === "number") {
            throw new Error("Can't create initial buffer");
        }
        this.noEditorBuffer = buf;

        // vscode may not send ondocument opened event, send manually
        // // for (const doc of vscode.workspace.textDocuments) {
        // // if (doc.isClosed) {
        // // continue;
        // // }
        // // await this.onOpenTextDocument(doc);
        // // }

        // create nvim external windows. each window is mapped to corresponding view column
        // each window has own grid. IDs are starting from 1000 with first win is 1000 and second win is 1002 (why?)
        const requests: [string, unknown[]][] = [
            ["nvim_buf_set_option", [this.noEditorBuffer.id, "modified", true]],
            ["nvim_win_set_buf", [0, this.noEditorBuffer.id]],
        ];
        for (let i = 1; i < 20; i++) {
            requests.push([
                "nvim_open_win",
                [
                    this.noEditorBuffer.id,
                    false,
                    {
                        external: true,
                        width: NVIM_WIN_WIDTH,
                        height: NVIM_WIN_HEIGHT,
                    },
                ],
            ]);
        }
        await this.client.callAtomic(requests);

        const wins = await this.client.windows;
        let currColumn = 1;
        for (const w of wins) {
            this.editorColumnIdToWinId.set(currColumn, w.id);
            currColumn++;
        }

        this.isInit = true;
        this.watchAndApplyNeovimEdits();
        this.watchAndProcessRedrawBatches();
        for (const e of vscode.window.visibleTextEditors) {
            await this.initBuffer(e);
        }
        // this.onChangedEdtiors(vscode.window.visibleTextEditors);
        await this.onChangedActiveEditor(vscode.window.activeTextEditor);
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        if (this.typeHandlerDisplose) {
            this.typeHandlerDisplose.dispose();
            this.typeHandlerDisplose = undefined;
        }
        this.client.quit();
    }

    private async initBuffer(e: vscode.TextEditor): Promise<NeovimBuffer | undefined> {
        const viewColumn = e.viewColumn;
        if (!viewColumn) {
            return;
        }
        const winId = this.editorColumnIdToWinId.get(viewColumn);
        if (!winId) {
            return;
        }
        const doc = e.document;
        const uri = doc.uri.toString();
        // todo: still needed?
        if (this.uriToBuffer.has(uri)) {
            const buf = this.uriToBuffer.get(uri)!;
            await this.client.request("nvim_win_set_buf", [winId, buf.id]);
            return;
        }
        this.documentChangesInInsertMode.set(uri, []);
        await this.nvimAttachWaiter;
        let buf: NeovimBuffer | undefined;
        if (this.pendingBuffers.has(uri)) {
            const bufId = this.pendingBuffers.get(uri);
            this.pendingBuffers.delete(uri);
            const buffers = await this.client.buffers;
            buf = buffers.find(b => b.id === bufId);
        } else {
            const bbuf = await this.client.createBuffer(true, true);
            if (typeof bbuf === "number") {
                return;
            }
            buf = bbuf;
        }
        if (!buf) {
            return;
        }
        // this.currentNeovimBuffer = buf;
        this.managedBufferIds.add(buf.id);
        const eol = doc.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
        const lines = doc.getText().split(eol);
        const {
            options: { insertSpaces, tabSize },
        } = e;

        const cursor = e.selection.active;
        const requests: [string, VimValue[]][] = [];
        requests.push(["nvim_win_set_buf", [winId, buf.id]]);
        requests.push(["nvim_buf_set_option", [buf.id, "expandtab", insertSpaces as boolean]]);
        requests.push(["nvim_buf_set_option", [buf.id, "tabstop", tabSize as number]]);
        requests.push(["nvim_buf_set_option", [buf.id, "shiftwidth", tabSize as number]]);
        requests.push(["nvim_buf_set_option", [buf.id, "softtabstop", tabSize as number]]);

        requests.push(["nvim_buf_set_lines", [buf.id, 0, 1, false, lines]]);
        // if (cursor) {
        requests.push(["nvim_win_set_cursor", [0, [cursor.line + 1, cursor.character]]]);
        // }
        requests.push(["nvim_buf_set_var", [buf.id, "vscode_controlled", true]]);
        requests.push(["nvim_buf_set_name", [buf.id, uri]]);
        requests.push(["nvim_call_function", ["VSCodeClearUndo", [buf.id]]]);
        this.editorPendingCursor.set(e, { line: cursor.line, col: cursor.character, screenRow: 0, totalSkips: 0 });
        await this.client.callAtomic(requests);
        this.bufferIdToUri.set(buf.id, uri);
        this.uriToBuffer.set(uri, buf);
        buf.listen("lines", this.onNeovimBufferEvent);
        return buf;
    }

    private onChangeTextDocument = async (e: vscode.TextDocumentChangeEvent): Promise<void> => {
        await this.nvimAttachWaiter;
        const uri = e.document.uri.toString();
        const version = e.document.version;
        if (this.documentLastChangedVersion.get(uri) === version) {
            return;
        }
        const eol = e.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
        const buf = this.uriToBuffer.get(uri);
        if (!buf) {
            return;
        }
        if (!this.managedBufferIds.has(buf.id)) {
            return;
        }
        const storedChanges = this.documentChangesInInsertMode.get(uri)!;
        const localChanges: DocumentChange[] = [];

        // !Note changes are not sorted and may come in any order
        for (const change of e.contentChanges) {
            const { range, text } = change;
            let currChange: DocumentChange | undefined;
            // if true when it's ordinary text change or newline insert
            if (change.range.isSingleLine) {
                const { line } = range.start;
                if (text === "\n" || text === "\r\n") {
                    currChange = {
                        start: line,
                        end: line,
                        newStart: line,
                        newEnd: line + 1,
                        version: e.document.version,
                    };
                } else {
                    // vscode may insert snippet or some other mutliline text. In this case the range will be singleLine, but text itself with EOL
                    const changedTextByEol = text.split(eol);
                    // ignore subsequent changes on same line
                    if (changedTextByEol.length === 1) {
                        const prevChange = storedChanges.slice(-1)[0];
                        if (
                            prevChange &&
                            prevChange.start === line &&
                            prevChange.end === line &&
                            prevChange.newStart === line &&
                            prevChange.newEnd === line
                        ) {
                            continue;
                        }
                    }
                    currChange = {
                        start: line,
                        end: line,
                        newStart: line,
                        newEnd: line + changedTextByEol.length - 1,
                        version: e.document.version,
                    };
                }
            } else {
                // deleted line/newline
                // for multiline changes we'll just find and invalid all current changes within change bounds
                if (text === "") {
                    currChange = {
                        start: range.start.line,
                        end: range.end.line,
                        newStart: range.start.line,
                        newEnd: range.start.line,
                        version: e.document.version,
                    };
                } else {
                    // multiline replace
                    const changedTextByEol = text.split(eol);
                    currChange = {
                        start: range.start.line,
                        end: range.end.line,
                        newStart: range.start.line,
                        newEnd: range.start.line + changedTextByEol.length - 1,
                        version: e.document.version,
                    };
                }
            }
            if (currChange) {
                localChanges.push(currChange);
            }
        }
        // vscode may send multiple changes with overlapping ranges, e.g. line 46 grows to 46-48, line 47 grows to 48-50
        // need to accumulate line diff from the prev change and apply it for next
        let lineDiffForNextChange = 0;
        for (const change of localChanges.sort((a, b) => (a < b ? -1 : a > b ? 1 : -1))) {
            change.start += lineDiffForNextChange;
            change.end += lineDiffForNextChange;
            change.newStart += lineDiffForNextChange;
            change.newEnd += lineDiffForNextChange;
            lineDiffForNextChange += change.newEnd - change.end;
        }
        storedChanges.push(...localChanges);
        if (!this.isInsertMode) {
            this.uploadDocumentChangesToNeovim();
        }
    };

    private onChangedEdtiors = async (): Promise<void> => {
        await this.nvimAttachWaiter;
        const requests: [string, unknown[]][] = [];
        const activeColumns: Set<number> = new Set();
        for (const editor of vscode.window.visibleTextEditors) {
            const uri = editor.document.uri.toString();
            if (!this.uriToBuffer.has(uri)) {
                await this.initBuffer(editor);
            }
            const buf = this.uriToBuffer.get(uri);
            if (!buf) {
                continue;
            }
            if (!editor.viewColumn) {
                continue;
            }
            const winId = this.editorColumnIdToWinId.get(editor.viewColumn);
            if (!winId) {
                continue;
            }
            activeColumns.add(editor.viewColumn);
            const cursor = editor.selection.active;
            // !for external buffer - without set_buf the buffer will disappear when switching to other editor and break vscode editor management
            // ! alternatively we can close the editor with such buf?
            requests.push(["nvim_win_set_buf", [winId, buf.id]]);
            if (this.managedBufferIds.has(buf.id)) {
                // !important: need to update cursor in atomic operation
                requests.push(["nvim_win_set_cursor", [winId, [cursor.line + 1, cursor.character]]]);
            }
            this.applyCursorStyleToEditor(editor, this.currentModeName);
        }
        // iterate through all columns and set non editor buffer in neovim window if there is no active editors exist for this column
        for (const [column, winId] of this.editorColumnIdToWinId) {
            if (activeColumns.has(column)) {
                continue;
            }
            requests.push(["nvim_win_set_buf", [winId, this.noEditorBuffer.id]]);
        }
        await this.client.callAtomic(requests);
        // wipeout any buffers with non visible documents. We process them here because onDidCloseTextDocument fires before onChangedEditors
        // and wiping out the buffer will close the associated nvim windows normally and we want to prevent this
        const allBuffers = await this.client.buffers;
        const wipeoutBuffers: Set<number> = new Set();
        for (const buffer of allBuffers) {
            const uri = this.bufferIdToUri.get(buffer.id);
            if (!uri) {
                continue;
            }
            if (buffer.id === this.noEditorBuffer.id) {
                continue;
            }
            if (!vscode.workspace.textDocuments.find(d => d.uri.toString() === uri)) {
                wipeoutBuffers.add(buffer.id);
                buffer.unlisten("lines", this.onNeovimBufferEvent);
                this.bufferIdToUri.delete(buffer.id);
                this.managedBufferIds.delete(buffer.id);
                this.uriToBuffer.delete(uri);
                this.documentChangesInInsertMode.delete(uri);
                this.documentLastChangedVersion.delete(uri);
            }
        }
        if (wipeoutBuffers.size) {
            await this.client.command(`bwipeout! ${[...wipeoutBuffers].join(" ")}`);
        }
    };

    private onChangedActiveEditor = async (e: vscode.TextEditor | undefined): Promise<void> => {
        // !Note called also when editor changes column
        await this.nvimAttachWaiter;

        if (!e || !e.viewColumn) {
            return;
        }
        const winId = this.editorColumnIdToWinId.get(e.viewColumn);
        if (!winId) {
            return;
        }
        this.applyCursorStyleToEditor(e, this.currentModeName);
        const requests: [string, unknown[]][] = [["nvim_set_current_win", [winId]]];
        const uri = e.document.uri.toString();
        const buf = this.uriToBuffer.get(uri);
        if (buf && this.managedBufferIds.has(buf.id)) {
            requests.unshift([
                "nvim_win_set_cursor",
                [winId, [e.selection.active.line + 1, e.selection.active.character]],
            ]);
        }
        await this.client.callAtomic(requests);
    };

    // Following lines are enabling vim-style cursor follow on scroll
    // although it's working, unfortunately it breaks vscode jumplist when scrolling to definition from outline/etc
    // I think it's better ot have more-less usable jumplist than such minor feature at this feature request will be implemented (https://github.com/microsoft/vscode/issues/84351)
    // private onChangeVisibleRange = async (e: vscode.TextEditorVisibleRangesChangeEvent): Promise<void> => {
    //     if (e.textEditor !== vscode.window.activeTextEditor) {
    //         return;
    //     }
    //     const ranges = e.visibleRanges[0];
    //     if (!ranges) {
    //         return;
    //     }
    //     if (this.shouldIgnoreMouseSelection) {
    //         return;
    //     }
    //     const editorRevealLine = this.textEditorsRevealing.get(e.textEditor);
    //     if (editorRevealLine) {
    //         if (editorRevealLine < ranges.start.line || editorRevealLine > ranges.end.line) {
    //             return;
    //         }
    //         this.textEditorsRevealing.delete(e.textEditor);
    //     }
    //     if (!this.isInsertMode) {
    //         this.commitScrolling(e.textEditor);
    //     }
    // };

    // private commitScrolling = throttle(
    //     (e: vscode.TextEditor) => {
    //         if (vscode.window.activeTextEditor !== e) {
    //             return;
    //         }
    //         const cursor = e.selection.active;
    //         const visibleRange = e.visibleRanges[0];
    //         if (!visibleRange) {
    //             return;
    //         }
    //         let updateCursor = false;
    //         if (cursor.line > visibleRange.end.line) {
    //             updateCursor = true;
    //             e.selections = [
    //                 new vscode.Selection(
    //                     visibleRange.end.line,
    //                     cursor.character,
    //                     visibleRange.end.line,
    //                     cursor.character,
    //                 ),
    //             ];
    //         } else if (cursor.line < visibleRange.start.line) {
    //             updateCursor = true;
    //             e.selections = [
    //                 new vscode.Selection(
    //                     visibleRange.start.line,
    //                     cursor.character,
    //                     visibleRange.start.line,
    //                     cursor.character,
    //                 ),
    //             ];
    //         }
    //         if (updateCursor && e.viewColumn) {
    //             const winId = this.editorColumnIdToWinId.get(e.viewColumn);
    //             if (winId) {
    //                 this.updateCursorPositionInNeovim(winId, e.selection.active.line, e.selection.active.character);
    //             }
    //         }
    //     },
    //     500,
    //     { leading: false },
    // );
    // private commitScrollingFast = throttle(this.updateScreenRowFromScrolling, 200, { leading: false });

    /**
     * Handle vscode selection change. This includes everything touching selection or cursor position, includes custom commands and selection = [] assignment
     */
    private onChangeSelection = async (e: vscode.TextEditorSelectionChangeEvent): Promise<void> => {
        // try to update cursor in neovim as rarely as we can
        if (this.isInsertMode) {
            return;
        }
        // multi-selection
        if (e.selections.length > 1) {
            return;
        }
        // !Important: ignore selection of non active editor.
        // !For peek definition and similar stuff vscode opens another editor and updates selections here
        // !We must ignore it otherwise the cursor will just "jump"
        if (e.textEditor !== vscode.window.activeTextEditor) {
            return;
        }
        const viewColumn = e.textEditor.viewColumn;
        if (!viewColumn) {
            return;
        }
        if (this.shouldIgnoreMouseSelection) {
            return;
        }
        // must skip unknown kind
        // unfortunately for outline navigation it's also Command change kind, so we mustn't skip it
        // if not it, we can skip whole vscode.TextEditorSelectionChangeKind.Command
        if (!e.kind) {
            return;
        }
        // scroll commands are Keyboard kind
        /*if (e.kind === vscode.TextEditorSelectionChangeKind.Keyboard) {
            return;
        }*/
        const cursor = e.selections[0].active;
        const winId = this.editorColumnIdToWinId.get(viewColumn);
        if (!winId) {
            return;
        }
        const gridConf = [...this.grids].find(g => g[1].winId === winId);
        if (!gridConf) {
            return;
        }
        if (gridConf[1].cursorLine === cursor.line && gridConf[1].cursorPos === cursor.character) {
            return;
        }
        this.updateCursorPositionInNeovim(winId, cursor.line, cursor.character);

        // let shouldUpdateNeovimCursor = false;

        // if (
        //     (cursor.line !== this.nvimRealLinePosition || cursor.character !== this.nvimRealColPosition) &&
        //     !this.isInsertMode
        // ) {
        //     shouldUpdateNeovimCursor = true;
        // }
        // if (shouldUpdateNeovimCursor) {
        //     // when jumping to definition cursor line is new and visible range is old, we'll align neovim screen row after scroll
        //     // const cursorScreenRow = visibleRange.contains(cursor) ? cursor.line - visibleRange.start.line : undefined;
        //     // when navigating to different file the onChangeSelection may come before onChangedTextEditor, so make sure we won't set cursor in the wrong buffer
        //     const uri = e.textEditor.document.uri.toString();
        //     const buf = this.uriToBuffer.get(uri);
        //     if (!buf || buf !== this.currentNeovimBuffer) {
        //         return;
        //     }
        //     this.updateCursorPositionInNeovim(cursor.line, cursor.character);
        // }
        // Kind may be undefined when:
        // 1) opening file
        // 2) setting selection in code
        /*if (!e.kind || e.kind === vscode.TextEditorSelectionChangeKind.Keyboard) {
            return;
        }
        // support mouse visual selection
        if (
            e.kind === vscode.TextEditorSelectionChangeKind.Mouse &&
            (e.selections.length > 1 || !e.selections[0].active.isEqual(e.selections[0].anchor)) &&
            this.mouseSelectionEnabled
        ) {
            const requests: [string, VimValue[]][] = [];
            if (this.currentModeName !== "visual") {
                requests.push(["nvim_input", ["v"]]);
            }
            const lastSelection = e.selections.slice(-1)[0];
            requests.push([
                "nvim_win_set_cursor",
                [0, [lastSelection.active.line + 1, lastSelection.active.character]],
            ]);
            await this.client.callAtomic(requests);
        } else if (!this.isScrolling) {
            // exclude clicks while in scrolling/in scroll commiting. It'll be handled in commitScrolling()
            const screenRow =
                e.kind === vscode.TextEditorSelectionChangeKind.Mouse
                    ? cursor.line - e.textEditor.visibleRanges[0].start.line - 1
                    : undefined;
            const cusror = e.textEditor.selection.active;
            await this.updateCursorPositionInNeovim(cusror.line, cusror.character, screenRow);
        }*/
    };

    private onVSCodeType = (_editor: vscode.TextEditor, edit: vscode.TextEditorEdit, type: { text: string }): void => {
        if (!this.isInit) {
            return;
        }
        if (!this.isInsertMode) {
            this.client.input(this.normalizeKey(type.text));
        } else {
            vscode.commands.executeCommand("default:type", { text: type.text });
        }
    };

    private normalizeKey(key: string): string {
        switch (key) {
            case "\n":
                return "<CR>";
            case "<":
                return "<LT>";
            default:
                return key;
        }
    }

    private normalizeString(str: string): string {
        return str.replace("\n", "<CR>").replace("<", "<LT>");
    }

    private onNeovimBufferEvent = (
        buffer: NeovimBuffer,
        tick: number,
        firstLine: number,
        lastLine: number,
        linedata: string[],
        _more: boolean,
    ): void => {
        // ignore in insert mode. This breaks o and O commands with <count> prefix but since we're rebinding them
        // to vscode commands it's not a big problem and anyway not supported (at least for now)
        // if (this.isInsertMode) {
        //     return;
        // }
        // vscode disallow to do multiple edits without awaiting textEditor.edit result
        // so we'll process all changes in slightly throttled function
        this.pendingBufChangesQueue.push({ buffer, firstLine, lastLine, data: linedata, tick });
        if (this.resolveBufQueuePromise) {
            this.resolveBufQueuePromise();
        }
    };

    private watchAndApplyNeovimEdits = async (): Promise<void> => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // unfortunately workspace edit also doens't work for multiple text edit
            // const workspaceEdit = new vscode.WorkspaceEdit();
            const edit = this.pendingBufChangesQueue.shift();
            if (!edit) {
                let timeout: NodeJS.Timeout | undefined;
                this.bufQueuePromise = new Promise(res => {
                    this.resolveBufQueuePromise = res;
                    // not necessary to timeout at all, but let's make sure
                    // !note looks like needed - increasing value starting to produce buffer desync. Because of this?
                    timeout = setTimeout(res, 50);
                });
                await this.bufQueuePromise;
                if (timeout) {
                    clearTimeout(timeout);
                }
                this.bufQueuePromise = undefined;
                this.resolveBufQueuePromise = undefined;
            } else {
                const { buffer, data, firstLine, lastLine, tick } = edit;
                const uri = this.bufferIdToUri.get(buffer.id);
                if (!uri) {
                    continue;
                }
                const skipTick = this.skipBufferTickUpdate.get(buffer.id) || 0;
                if (skipTick >= tick) {
                    continue;
                }
                let textEditor: vscode.TextEditor | undefined;
                if (this.externalBuffersShowOnNextChange.has(buffer.id)) {
                    this.externalBuffersShowOnNextChange.delete(buffer.id);
                    textEditor = await vscode.window.showTextDocument(vscode.Uri.parse(uri));
                } else {
                    textEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri);
                }
                if (!textEditor) {
                    continue;
                }
                this.documentLastChangedVersion.set(uri, textEditor.document.version + 1);
                const endRangeLine = lastLine;
                const endRangePos = 0;

                // since line could be changed/deleted/etc, invalidate them in highlight provider
                // for (let line = firstLine; line <= lastLine; line++) {
                //     this.documentHighlightProvider.removeLine(uri, line);
                // }
                // if (endRangeLine >= textEditor.document.lineCount) {
                //     endRangeLine = textEditor.document.lineCount - 1;
                //     endRangePos = textEditor.document.lineAt(endRangeLine).rangeIncludingLineBreak.end.character;
                // }
                // nvim sends following:
                // string change - firstLine is the changed line , lastLine + 1
                // cleaned line but not deleted - first line is the changed line, lastLine + 1, linedata is ""
                // newline insert - firstLine = lastLine and linedata is ""
                // line deleted - firstLine is changed line, lastLine + 1, linedata is empty []
                // LAST LINE is exclusive and can be out of the last editor line
                await textEditor.edit(builder => {
                    if (firstLine !== lastLine && data.length === 1 && data[0] === "") {
                        builder.replace(
                            new vscode.Range(firstLine, 0, endRangeLine, endRangePos),
                            endRangeLine >= textEditor!.document.lineCount ? "" : "\n",
                        );
                    } else if (firstLine !== lastLine && (!data.length || (data.length === 1 && data[0] === ""))) {
                        // FIXME: {\n} - ci{ adding line
                        builder.replace(new vscode.Range(firstLine, 0, endRangeLine, endRangePos), "");
                    } else {
                        const lines = data.map((d: string) => d + "\n");
                        // remove last "\n" if end range is greather than existing ranges. otherwise vscode will insert new line
                        if (endRangeLine >= textEditor!.document.lineCount && lines.length) {
                            const newLine = lines.pop()!.slice(0, -1);
                            lines.push(newLine);
                        }
                        // handle when change is overflow through editor lines. E.g. pasting on last line.
                        // Without newline it will append to the current one
                        if (firstLine >= textEditor!.document.lineCount) {
                            lines.unshift("\n");
                        }
                        builder.replace(new vscode.Range(firstLine, 0, endRangeLine, endRangePos), lines.join(""));
                    }
                });
            }
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private onNeovimNotification = (method: string, events: [string, ...any[]]): void => {
        if (method === "vscode-command") {
            const [vscodeCommand, ...commandArgs] = events;
            this.handleVSCodeCommand(vscodeCommand, ...commandArgs);
            return;
        }
        if (method === "vscode-range-command") {
            const [vscodeCommand, line1, line2, ...args] = events;
            this.handleVSCodeRangeCommand(vscodeCommand, line1, line2, ...args);
            return;
        }
        if (method === "vscode-neovim") {
            const [command, args] = events;
            this.handleExtensionRequest(command, args);
            return;
        }
        if (method !== "redraw") {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currRedrawNotifications: [string, ...any[]][] = [];
        let flush = false;
        for (const [name, ...args] of events) {
            if (name === "flush") {
                flush = true;
            } else {
                currRedrawNotifications.push([name, ...args]);
            }
        }
        if (flush) {
            // this.pendingRedrawNotificationsQueue.push([...this.currentRedrawBatch, ...currRedrawNotifications]);
            const batch = [...this.currentRedrawBatch, ...currRedrawNotifications];
            this.currentRedrawBatch = [];
            this.redrawBatchQueue.push(batch);
            if (this.resolveRedrawBatchQueuePromise) {
                this.resolveRedrawBatchQueuePromise();
            }
        } else {
            this.currentRedrawBatch.push(...currRedrawNotifications);
        }
    };

    private watchAndProcessRedrawBatches = async (): Promise<void> => {
        // need sync queue otherwise HL may be broken (especially when has many results from incsearch)
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const batch = this.redrawBatchQueue.shift();
            if (!batch) {
                let timeout: NodeJS.Timeout | undefined;
                this.redrawBatchQueuePromise = new Promise(res => {
                    this.resolveRedrawBatchQueuePromise = res;
                    timeout = setTimeout(res, 50);
                });
                await this.redrawBatchQueuePromise;
                if (timeout) {
                    clearTimeout(timeout);
                }
                this.redrawBatchQueuePromise = undefined;
                this.resolveRedrawBatchQueuePromise = undefined;
            } else {
                // process notification
                let newModeName: string | undefined;
                // since neovim sets cmdheight=0 internally various vim plugins like easymotion are working incorrect and awaiting hitting enter
                let acceptPrompt = false;
                const gridHighlights: Map<number, RedrawHighlightsUpdates> = new Map();
                const gridCursorUpdates: Set<number> = new Set();
                for (const [name, ...args] of batch) {
                    const firstArg = args[0] || [];
                    switch (name) {
                        case "mode_info_set": {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const [, modes] = firstArg as [string, any[]];
                            for (const mode of modes) {
                                if (!mode.name) {
                                    continue;
                                }
                                this.vimModes.set(
                                    mode.name,
                                    "cursor_shape" in mode
                                        ? {
                                              attrId: mode.attr_id,
                                              attrIdLm: mode.attr_id_lm,
                                              cursorShape: mode.cursor_shape,
                                              name: mode.name,
                                              shortName: mode.short_name,
                                              blinkOff: mode.blinkoff,
                                              blinkOn: mode.blinkon,
                                              blinkWait: mode.blinkwait,
                                              cellPercentage: mode.cell_percentage,
                                              mouseShape: mode.mouse_shape,
                                          }
                                        : {
                                              name: mode.name,
                                              shortName: mode.short_name,
                                              mouseShape: mode.mouse_shape,
                                          },
                                );
                            }
                            break;
                        }
                        case "hl_attr_define": {
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            for (const [id, uiAttrs, , info] of args as [
                                number,
                                never,
                                never,
                                [{ kind: "ui"; ui_name: string; hi_name: string }],
                            ][]) {
                                if (info && info[0] && info[0].hi_name) {
                                    const name = info[0].hi_name;
                                    this.highlightProvider.addHighlightGroup(id, name, uiAttrs);
                                }
                            }
                            break;
                        }
                        case "cmdline_show": {
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            const [content, pos, firstc, prompt, indent, level] = firstArg as [
                                [object, string][],
                                number,
                                string,
                                string,
                                number,
                                number,
                            ];
                            const allContent = content.map(([, str]) => str);
                            this.commandLine.show(allContent.join(""), firstc, prompt);
                            break;
                        }
                        case "wildmenu_show": {
                            const [items] = firstArg as [string[]];
                            this.commandLine.setCompletionItems(items);
                            break;
                        }
                        case "cmdline_hide": {
                            this.commandLine.cancel();
                            break;
                        }
                        case "msg_showcmd": {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const [content] = firstArg as [string, any[]];
                            let str = "";
                            if (content) {
                                for (const c of content) {
                                    const [, cmdStr] = c;
                                    if (cmdStr) {
                                        str += cmdStr;
                                    }
                                }
                            }
                            this.statusLine.statusString = str;
                            break;
                        }
                        case "msg_show": {
                            let str = "";
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            for (const [type, content] of args as [string, any[], never][]) {
                                // if (ui === "confirm" || ui === "confirmsub" || ui === "return_prompt") {
                                //     this.nextInputBlocking = true;
                                // }
                                if (type === "return_prompt") {
                                    acceptPrompt = true;
                                }
                                if (content) {
                                    for (const c of content) {
                                        const [, cmdStr] = c;
                                        if (cmdStr) {
                                            str += cmdStr;
                                        }
                                    }
                                }
                            }
                            this.statusLine.msgString = str;
                            break;
                        }
                        case "msg_showmode": {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const [content] = firstArg as [any[]];
                            let str = "";
                            if (content) {
                                for (const c of content) {
                                    const [, modeStr] = c;
                                    if (modeStr) {
                                        str += modeStr;
                                    }
                                }
                            }
                            this.statusLine.modeString = str;
                            break;
                        }
                        case "msg_clear": {
                            this.statusLine.msgString = "";
                            break;
                        }
                        case "mode_change": {
                            // update cursor for all visible editors
                            for (const e of vscode.window.visibleTextEditors) {
                                if (!e.viewColumn) {
                                    continue;
                                }
                                const winId = this.editorColumnIdToWinId.get(e.viewColumn);
                                if (!winId) {
                                    continue;
                                }
                                const grid = [...this.grids].find(([, conf]) => conf.winId === winId);
                                if (!grid) {
                                    continue;
                                }
                                gridCursorUpdates.add(grid[0]);
                            }
                            [newModeName] = firstArg as [string, never];
                            break;
                        }
                        case "win_pos": {
                            const [grid, win] = firstArg as [number, Window];
                            if (!this.grids.has(grid)) {
                                this.grids.set(grid, {
                                    winId: win.id,
                                    cursorLine: 0,
                                    cursorPos: 0,
                                    screenLine: 0,
                                });
                            }
                            break;
                        }
                        case "win_close": {
                            for (const [grid] of args as [number][]) {
                                this.grids.delete(grid);
                            }
                            break;
                        }
                        case "win_external_pos": {
                            for (const [grid, win] of args as [number, Window][]) {
                                if (!this.grids.has(grid)) {
                                    this.grids.set(grid, {
                                        winId: win.id,
                                        cursorLine: 0,
                                        cursorPos: 0,
                                        screenLine: 0,
                                    });
                                }
                            }
                            break;
                        }
                        case "grid_cursor_goto": {
                            for (const [grid, screenRow] of args as [number, number, number][]) {
                                gridCursorUpdates.add(grid);
                                const conf = this.grids.get(grid);
                                if (conf) {
                                    conf.screenLine = screenRow;
                                }
                            }
                            break;
                        }
                        case "grid_line": {
                            for (const gridEvent of args) {
                                const [grid, row, colStart, cells] = gridEvent as [
                                    number,
                                    number,
                                    number,
                                    [string, number?, number?],
                                ];
                                const gridConf = this.grids.get(grid);
                                if (!gridConf) {
                                    continue;
                                }
                                const columnToWinId = [...this.editorColumnIdToWinId].find(
                                    ([, id]) => id === gridConf.winId,
                                );
                                if (!columnToWinId) {
                                    continue;
                                }
                                let cellIdx = 0;

                                const editor = vscode.window.visibleTextEditors.find(
                                    e => e.viewColumn === columnToWinId[0],
                                );
                                if (!editor) {
                                    continue;
                                }
                                const uri = editor.document.uri.toString();
                                const buf = this.uriToBuffer.get(uri);
                                const isExternal = buf && this.managedBufferIds.has(buf.id) ? false : true;
                                const finalRow = row;

                                // store highlight updates, then apply then after flush()
                                let cellHlId = 0;
                                if (!gridHighlights.has(grid)) {
                                    gridHighlights.set(grid, {});
                                }
                                const gridHighlight = gridHighlights.get(grid)!;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                for (const [, hlId, repeat] of cells as any[]) {
                                    if (hlId != null) {
                                        cellHlId = hlId;
                                    }
                                    for (let i = 0; i < (repeat || 1); i++) {
                                        const col = colStart + cellIdx;
                                        const highlightGroup = this.highlightProvider.getHighlightGroupName(
                                            cellHlId,
                                            isExternal,
                                        );
                                        if (!gridHighlight[finalRow]) {
                                            gridHighlight[finalRow] = {};
                                        }
                                        if (!gridHighlight[finalRow][col]) {
                                            gridHighlight[finalRow][col] = "remove";
                                        }
                                        if (highlightGroup) {
                                            gridHighlight[finalRow][col] = highlightGroup;
                                        }
                                        cellIdx++;
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
                await this.applyRedrawUpdate(newModeName, gridCursorUpdates, gridHighlights, acceptPrompt);
            }
        }
    };

    private applyRedrawUpdate = async (
        newModeName: string | undefined,
        cursorUpdates: Set<number>,
        highlightUpdates: Map<number, RedrawHighlightsUpdates>,
        acceptPrompt: boolean,
    ): Promise<void> => {
        const editorColumnsToWin = [...this.editorColumnIdToWinId];
        const prevModeName = this.currentModeName;
        if (newModeName) {
            this.handleModeChange(newModeName);
        }
        if (cursorUpdates.size || highlightUpdates.size) {
            const syncCursorsGrids: Set<number> = new Set([...cursorUpdates, ...highlightUpdates.keys()]);
            // we need to know if current mode is blocking otherwise nvim_win_get_cursor/nvim_call_function will stuck until unblock
            // todo: investigate if it's possible to not call nvim_win_get_cursor(). This probably will require cursor tracking (what to do when where won't be grid_scroll event?)
            const mode = await this.client.mode;
            if (!mode.blocking) {
                let hasVisualCursor = false;
                const requests: [string, unknown[]][] = [];
                const shouldUpateGrids: number[] = [];
                for (const syncCursorGrid of syncCursorsGrids) {
                    const gridConf = this.grids.get(syncCursorGrid);
                    if (!gridConf) {
                        continue;
                    }
                    const winConf = editorColumnsToWin.find(([, id]) => id === gridConf.winId);
                    if (!winConf) {
                        continue;
                    }
                    const winId = winConf[1];
                    shouldUpateGrids.push(syncCursorGrid);
                    requests.push(["nvim_win_get_cursor", [winId]]);
                }
                if (mode.mode === "v" || mode.mode === "V" || mode.mode.charCodeAt(0) === 22) {
                    hasVisualCursor = true;
                    requests.push(["nvim_call_function", ["getpos", ["v"]]]);
                }
                const result = (await this.client.callAtomic(requests)) as [
                    [number, number, number?, number?][],
                    unknown,
                ];
                let visualStart: [number, number, number, number] | undefined;
                if (hasVisualCursor) {
                    visualStart = result[0].pop() as [number, number, number, number];
                }
                // set cursor updates
                const currentEditor = vscode.window.activeTextEditor;
                for (let i = 0; i < result[0].length; i++) {
                    const gridId = shouldUpateGrids[i];
                    const cursor = result[0][i];

                    const gridConf = this.grids.get(gridId);
                    if (!gridConf) {
                        continue;
                    }
                    gridConf.cursorLine = cursor[0] - 1;
                    gridConf.cursorPos = cursor[1];
                }
                for (const grid of shouldUpateGrids) {
                    const conf = this.grids.get(grid);
                    if (!conf) {
                        continue;
                    }
                    if (!cursorUpdates.has(grid)) {
                        continue;
                    }
                    const columnWin = editorColumnsToWin.find(([, winId]) => winId === conf.winId);
                    if (!columnWin) {
                        continue;
                    }
                    const editor = vscode.window.visibleTextEditors.find(e => e.viewColumn === columnWin[0]);
                    if (!editor) {
                        continue;
                    }
                    // disallow curesor updates for non active editor
                    if (editor !== vscode.window.activeTextEditor) {
                        continue;
                    }
                    this.updateCursorPosInEditor(
                        editor,
                        conf.cursorLine,
                        conf.cursorPos,
                        mode.mode,
                        // for visual selection reflect the selection for all editors opened the same document
                        // visualStart &&
                        //     currentEditor &&
                        //     editor.document.uri.toString() === currentEditor.document.uri.toString()
                        //     ? visualStart
                        //     : undefined,
                        // todo: align to vim behavior? currently other editor in pane selects all from own cursor to selection
                        currentEditor === editor ? visualStart : undefined,
                        // force update cursor to clear current selections when going off from the visual modes
                        prevModeName === "visual" && newModeName !== "visual",
                    );
                }
            }
        }
        for (const [grid, updates] of highlightUpdates) {
            const gridConf = this.grids.get(grid);
            if (!gridConf) {
                continue;
            }
            const editorColumn = editorColumnsToWin.find(([, winId]) => gridConf.winId === winId);
            if (!editorColumn) {
                continue;
            }
            const editor = vscode.window.visibleTextEditors.find(e => e.viewColumn === editorColumn[0]);
            if (!editor) {
                continue;
            }

            const topScreenLine = gridConf.cursorLine === 0 ? 0 : gridConf.cursorLine - gridConf.screenLine;
            for (const [lineId, highlights] of Object.entries(updates)) {
                for (const [colId, group] of Object.entries(highlights)) {
                    if (group === "remove") {
                        this.highlightProvider.remove(grid, topScreenLine + parseInt(lineId, 10), parseInt(colId, 10));
                    } else {
                        this.highlightProvider.add(
                            grid,
                            group,
                            topScreenLine + parseInt(lineId, 10),
                            parseInt(colId, 10),
                        );
                    }
                }
            }
            const highlights = this.highlightProvider.provideGridHighlights(grid);
            for (const [decorator, ranges] of highlights) {
                editor.setDecorations(decorator, ranges);
            }
        }
        if (acceptPrompt) {
            this.client.input("<CR>");
        }
    };

    private handleModeChange = (modeName: string): void => {
        this.isInsertMode = modeName === "insert";
        if (this.isInsertMode && this.typeHandlerDisplose) {
            this.typeHandlerDisplose.dispose();
            this.typeHandlerDisplose = undefined;
        } else if (!this.isInsertMode && !this.typeHandlerDisplose) {
            this.typeHandlerDisplose = vscode.commands.registerTextEditorCommand("type", this.onVSCodeType);
        }
        this.currentModeName = modeName;
        const e = vscode.window.activeTextEditor;
        if (!e) {
            return;
        }
        vscode.commands.executeCommand("setContext", "neovim.mode", modeName);
        this.applyCursorStyleToEditor(e, modeName);
    };

    private updateCursorPositionInNeovim = async (winId: number, line: number, col: number): Promise<void> => {
        // if (this.nvimRealLinePosition !== line || this.nvimRealColPosition !== col) {
        await this.client.request("nvim_win_set_cursor", [winId, [line + 1, col]]);
        // }
    };

    private isVisualMode(modeShortName: string): boolean {
        return modeShortName === "v" || modeShortName === "V" || modeShortName.charCodeAt(0) === 22;
    }

    /**
     * Update cursor in active editor. Coords are zero based
     */
    private updateCursorPosInEditor = (
        editor: vscode.TextEditor,
        newLine: number,
        newCol: number,
        mode: string,
        visualStart?: [number, number, number, number],
        forceUpdate = false,
    ): void => {
        const pendingCursor = this.editorPendingCursor.get(editor);
        if (pendingCursor) {
            // disallow skipping more than 2 cursor requests to prevent failing into some bad state. Not very elegant
            if ((newLine !== pendingCursor.line || newCol !== pendingCursor.col) && pendingCursor.totalSkips < 2) {
                pendingCursor.totalSkips++;
                return;
            } else {
                this.editorPendingCursor.delete(editor);
            }
        }
        const currentCursor = editor.selections[0].active;
        if (
            currentCursor.line === newLine &&
            currentCursor.character === newCol &&
            !this.isVisualMode(mode) &&
            !forceUpdate
        ) {
            return;
        }
        const visibleRange = editor.visibleRanges[0];
        let revealCursor = new vscode.Selection(newLine, newCol, newLine, newCol);
        if (this.isVisualMode(mode) && Array.isArray(visualStart)) {
            // visual/visual line/visual block (char code = 22) modes
            // visual start pos is 1.1 based
            const visualStartLine = visualStart[1] - 1;
            const visualStartChar = visualStart[2] - 1;
            if (mode === "v") {
                // vscode selection is differ than vim selection: in vim the character is selected under the block cursor
                // but in vscode it's not. workaround it by creating second selection with newCol +- 1
                if (newCol >= visualStartChar && newLine >= visualStartLine) {
                    revealCursor = new vscode.Selection(visualStartLine, visualStartChar, newLine, newCol);
                    editor.selections = [revealCursor, new vscode.Selection(newLine, newCol + 1, newLine, newCol)];
                } else {
                    // backward selection - move anchor to next character
                    revealCursor = new vscode.Selection(visualStartLine, visualStartChar + 1, newLine, newCol);
                    editor.selections = [revealCursor];
                }
            } else if (mode === "V") {
                // for visual line mode we add each selection (with own cursor) for own line, the line with the cursor is broke by
                // two selections to simulate moving cursor while in visual line mode
                // for visual line we put cursor at the start, for visual block at the direction
                const doc = editor.document;
                const selections: vscode.Selection[] = [];
                const lineStart = visualStartLine <= newLine ? visualStartLine : newLine;
                const lineEnd = visualStartLine > newLine ? visualStartLine : newLine;
                for (let line = lineStart; line <= lineEnd; line++) {
                    const docLine = doc.lineAt(line);
                    const firstNonWhitespaceChar = docLine.firstNonWhitespaceCharacterIndex;
                    if (line === newLine) {
                        if (newCol === 0) {
                            revealCursor = new vscode.Selection(line, 99999, line, 0);
                            selections.push(revealCursor);
                        } else {
                            revealCursor = new vscode.Selection(line, 99999, line, newCol);
                            selections.push(new vscode.Selection(line, 0, line, newCol), revealCursor);
                        }
                    } else {
                        if (firstNonWhitespaceChar === 0) {
                            selections.push(new vscode.Selection(line, 99999, line, firstNonWhitespaceChar));
                        } else {
                            selections.push(
                                new vscode.Selection(line, 0, line, firstNonWhitespaceChar),
                                new vscode.Selection(line, 99999, line, firstNonWhitespaceChar),
                            );
                        }
                    }
                }
                editor.selections = selections;
            } else {
                // visual block mode
                const selections: vscode.Selection[] = [];
                const lineStart = visualStartLine <= newLine ? visualStartLine : newLine;
                const lineEnd = visualStartLine > newLine ? visualStartLine : newLine;
                for (let line = lineStart; line <= lineEnd; line++) {
                    // do similar trick as with visual char mode - produce two selections for forward selection
                    // and increase anchor for backward selection
                    const lineSelections: vscode.Selection[] = [];
                    if (newCol > visualStartChar) {
                        lineSelections.push(
                            new vscode.Selection(line, visualStartChar, line, newCol),
                            new vscode.Selection(line, newCol + 1, line, newCol),
                        );
                    } else {
                        lineSelections.push(new vscode.Selection(line, visualStartChar + 1, line, newCol));
                    }
                    selections.push(...lineSelections);
                    if (line === newLine) {
                        revealCursor = lineSelections[0];
                    }
                }
                editor.selections = selections;
            }
        } else if (this.leaveMultipleCursorsForVisualMode) {
            // we have prepared cursors already, just reveal first if needed
            revealCursor = editor.selections[0];
        } else {
            editor.selections = [revealCursor];
        }

        const visibleLines = visibleRange.end.line - visibleRange.start.line;
        // this.commitScrolling.cancel();
        if (visibleRange.contains(revealCursor)) {
            // always try to reveal even if in visible range to reveal horizontal scroll
            editor.revealRange(
                new vscode.Range(revealCursor.active, revealCursor.active),
                vscode.TextEditorRevealType.Default,
            );
        } else if (revealCursor.active.line < visibleRange.start.line) {
            const revealType =
                visibleRange.start.line - revealCursor.active.line >= visibleLines / 2
                    ? vscode.TextEditorRevealType.Default
                    : vscode.TextEditorRevealType.AtTop;
            // this.textEditorsRevealing.set(editor, revealCursor.active.line);
            editor.revealRange(new vscode.Range(revealCursor.active, revealCursor.active), revealType);
            // vscode.commands.executeCommand("revealLine", { lineNumber: revealCursor.active.line, at: revealType });
        } else if (revealCursor.active.line > visibleRange.end.line) {
            const revealType =
                revealCursor.active.line - visibleRange.end.line >= visibleLines / 2
                    ? vscode.TextEditorRevealType.InCenter
                    : vscode.TextEditorRevealType.Default;
            // this.textEditorsRevealing.set(editor, revealCursor.active.line);
            editor.revealRange(new vscode.Range(revealCursor.active, revealCursor.active), revealType);
            // vscode.commands.executeCommand("revealLine", { lineNumber: revealCursor.active.line, at: revealType });
        }
    };

    private prepareForMultiCursorEditingFromVisualMode(append: boolean, visualMode: string): void {
        if (!vscode.window.activeTextEditor) {
            return;
        }
        if (this.currentModeName !== "visual") {
            return;
        }
        this.leaveMultipleCursorsForVisualMode = true;
        const sels = vscode.window.activeTextEditor.selections;
        const newSelections: vscode.Selection[] = [];
        const doc = vscode.window.activeTextEditor.document;
        for (const sel of sels) {
            if (newSelections.find(s => s.active.line === sel.active.line)) {
                continue;
            }
            const line = doc.lineAt(sel.active.line);
            const linePos = sel.active.line;
            let char = 0;
            if (visualMode === "V") {
                char = append ? line.range.end.character : line.firstNonWhitespaceCharacterIndex;
            } else {
                // visual block - take cursor pos and do insert/append after it
                char = append ? sel.active.character + 1 : sel.active.character;
            }
            newSelections.push(new vscode.Selection(linePos, char, linePos, char));
        }
        vscode.window.activeTextEditor.selections = newSelections;
    }

    private applyCursorStyleToEditor(editor: vscode.TextEditor, modeName: string): void {
        const mode = this.vimModes.get(modeName);
        if (!mode) {
            return;
        }
        if ("cursorShape" in mode) {
            if (mode.cursorShape === "block") {
                editor.options.cursorStyle = vscode.TextEditorCursorStyle.Block;
            } else if (mode.cursorShape === "horizontal") {
                editor.options.cursorStyle = vscode.TextEditorCursorStyle.Underline;
            } else {
                editor.options.cursorStyle = vscode.TextEditorCursorStyle.Line;
            }
        }
    }

    private async attachNeovimExternalBuffer(
        name: string,
        id: number,
        expandTab: boolean,
        tabStop: number,
    ): Promise<void> {
        // already processed
        if (this.bufferIdToUri.has(id)) {
            const uri = this.bufferIdToUri.get(id)!;
            const buf = this.uriToBuffer.get(uri);
            if (!buf) {
                return;
            }
            const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);
            if (doc) {
                // vim may send two requests, for example for :help - first it opens buffer with empty content in new window
                // then read file and reload the buffer
                const lines = await buf.lines;
                const editor = await vscode.window.showTextDocument(doc, {
                    preserveFocus: false,
                    preview: true,
                    viewColumn: vscode.ViewColumn.Active,
                });
                // need always to use spaces otherwise col will be different and vim HL will be incorrect
                editor.options.insertSpaces = true;
                editor.options.tabSize = tabStop;
                // using replace produces ugly selection effect, try to avoid it by using insert
                editor.edit(b => b.insert(new vscode.Position(0, 0), lines.join("\n")));
                vscode.commands.executeCommand("editor.action.indentationToSpaces");
            }
            return;
        }
        // if (!name) {
        // return;
        // }

        const buffers = await this.client.buffers;
        // get buffer handle
        const buf = buffers.find(b => b.id === id);
        if (!buf) {
            return;
        }
        // :help, PlugStatus etc opens new window. close it and attach to existing window instead
        const windows = await this.client.windows;
        const possibleBufWindow = windows.find(
            w => ![...this.editorColumnIdToWinId].find(([, winId]) => w.id === winId),
        );
        if (possibleBufWindow && vscode.window.activeTextEditor) {
            const winBuf = await possibleBufWindow.buffer;
            if (winBuf.id === buf.id) {
                const column = vscode.window.activeTextEditor.viewColumn || vscode.ViewColumn.One;
                const winId = this.editorColumnIdToWinId.get(column)!;
                await this.client.callAtomic([
                    ["nvim_win_set_buf", [winId, buf.id]],
                    ["nvim_win_close", [possibleBufWindow.id, false]],
                ]);
                // await this.client.request("nvim_win_close", [possibleBufWindow.id, false]);
            }
        }
        // we want to send initial buffer content with nvim_buf_lines event but listen("lines") doesn't support it
        const p = buf[ATTACH](true);
        this.client.attachBuffer(buf, "lines", this.onNeovimBufferEvent);
        await p;
        // buf.listen("lines", this.onNeovimBufferEvent);
        const lines = await buf.lines;
        // will trigger onOpenTextDocument but it's fine since the doc is not yet displayed and we won't process it
        const doc = await vscode.workspace.openTextDocument({
            content: lines.join("\n"),
        });
        const uri = doc.uri.toString();
        this.uriToBuffer.set(uri, buf);
        this.bufferIdToUri.set(id, uri);
        if (!lines.length || lines.every(l => !l.length)) {
            this.externalBuffersShowOnNextChange.add(buf.id);
        } else {
            const editor = await vscode.window.showTextDocument(doc, {
                preserveFocus: false,
                preview: true,
                viewColumn: vscode.ViewColumn.Active,
            });
            // need always to use spaces otherwise col will be different and vim HL will be incorrect
            editor.options.insertSpaces = true;
            editor.options.tabSize = tabStop;
            vscode.commands.executeCommand("editor.action.indentationToSpaces");
        }
    }

    /**
     *
     * @param hlGroupName VIM HL Group name
     * @param decorations Text decorations, the format is [[lineNum, [colNum, text][]]]
     */
    private applyTextDecorations(hlGroupName: string, decorations: [string, [number, string][]][]): void {
        const decorator = this.highlightProvider.getDecoratorForHighlightGroup(hlGroupName);
        if (!decorator) {
            return;
        }
        const conf = this.highlightProvider.getDecoratorOptions(decorator);
        const options: vscode.DecorationOptions[] = [];
        for (const [lineStr, cols] of decorations) {
            const line = parseInt(lineStr, 10) - 1;

            for (const [colNum, text] of cols) {
                const col = colNum - 1;
                const opt: vscode.DecorationOptions = {
                    range: new vscode.Range(line, col, line, col),
                    renderOptions: {
                        before: {
                            ...conf,
                            ...conf.before,
                            contentText: text,
                        },
                    },
                };
                options.push(opt);
            }
        }
        if (vscode.window.activeTextEditor) {
            vscode.window.activeTextEditor.setDecorations(decorator, options);
        }
    }

    private handleCustomRequest = async (
        eventName: string,
        eventArgs: [string, ...unknown[]],
        response: RequestResponse,
    ): Promise<void> => {
        try {
            let result: unknown;
            if (eventName === "vscode-command") {
                const [vscodeCommand, ...commandArgs] = eventArgs;
                result = await this.handleVSCodeCommand(vscodeCommand, ...commandArgs);
            } else if (eventName === "vscode-range-command") {
                const [vscodeCommand, line1, line2, ...commandArgs] = eventArgs as [
                    string,
                    number,
                    number,
                    ...unknown[],
                ];
                result = await this.handleVSCodeRangeCommand(vscodeCommand, line1, line2, ...commandArgs);
            } else if (eventName === "vscode-neovim") {
                const [command, commandArgs] = eventArgs as [string, unknown[]];
                result = await this.handleExtensionRequest(command, commandArgs);
            }
            response.send(result || "", false);
        } catch (e) {
            response.send(e.message, true);
        }
    };

    private async handleVSCodeCommand(command: string, ...args: unknown[]): Promise<unknown> {
        return await this.runVSCodeCommand(command, ...args);
    }

    private async handleVSCodeRangeCommand(
        command: string,
        line1: number,
        line2: number,
        ...args: unknown[]
    ): Promise<unknown> {
        if (vscode.window.activeTextEditor) {
            this.shouldIgnoreMouseSelection = true;
            const prevSelections = [...vscode.window.activeTextEditor.selections];
            vscode.window.activeTextEditor.selections = [
                new vscode.Selection(line2 as number, 0, ((line1 as number) - 1) as number, 0),
            ];
            const res = await this.runVSCodeCommand(command, ...args);
            vscode.window.activeTextEditor.selections = prevSelections;
            this.shouldIgnoreMouseSelection = false;
            return res;
        }
    }

    private async handleExtensionRequest(command: string, args: unknown[]): Promise<unknown> {
        switch (command) {
            case "external-buffer": {
                const [name, idStr, expandTab, tabStop] = args as [string, string, number, number];
                const id = parseInt(idStr, 10);
                if (!this.managedBufferIds.has(id)) {
                    // Handle when trying to open vscode uri from vim
                    // todo: naive checking
                    if (name && /:\/\//.test(name)) {
                        try {
                            const uri = vscode.Uri.parse(name, true);
                            this.pendingBuffers.set(name, id);
                            const doc = await vscode.workspace.openTextDocument(uri);
                            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active);
                        } catch {
                            // ignore ?
                        }
                    } else {
                        await this.attachNeovimExternalBuffer(name, id, !!expandTab, tabStop);
                    }
                } else {
                    const uri = this.bufferIdToUri.get(id);
                    if (uri) {
                        // !Important! This is messing with vscode window management: when you close the editor
                        // !vscode will display previous one in the same pane, but neovim buffer may be different
                        // !so active editor will switch to the wrong one
                        // !Important: this affects vim jumplist, but we use vscode one for now
                        // await vscode.window.showTextDocument(vscode.Uri.parse(uri));
                    }
                }
                break;
            }
            case "text-decorations": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const [hlName, cols] = args as any;
                this.applyTextDecorations(hlName, cols);
                break;
            }
            case "reveal": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const [at, updateCursor] = args as any;
                this.revealLine(at, !!updateCursor);
                break;
            }
            case "move-cursor": {
                const [to] = args as ["top" | "middle" | "bottom"];
                this.goToLine(to);
                break;
            }
            case "scroll": {
                const [by, to] = args as ["page" | "halfPage", "up" | "down"];
                this.scrollPage(by, to);
                break;
            }
            case "scroll-line": {
                const [to] = args as ["up" | "down"];
                this.scrollLine(to);
                break;
            }
            case "visual-edit": {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const [append, visualMode] = args as any;
                this.prepareForMultiCursorEditingFromVisualMode(!!append, visualMode);
                break;
            }
            case "open-file": {
                const [fileName, close] = args as [string, number | "all"];
                const currEditor = vscode.window.activeTextEditor;
                let doc: vscode.TextDocument | undefined;
                if (fileName === "__vscode_new__") {
                    doc = await vscode.workspace.openTextDocument();
                } else {
                    doc = await vscode.workspace.openTextDocument(fileName.trim());
                }
                if (!doc) {
                    return;
                }
                let viewColumn: vscode.ViewColumn | undefined;
                if (close && close !== "all" && currEditor) {
                    viewColumn = currEditor.viewColumn;
                    await vscode.commands.executeCommand("workbench.action.revertAndCloseActiveEditor");
                }
                await vscode.window.showTextDocument(doc, viewColumn);
                if (close === "all") {
                    await vscode.commands.executeCommand("workbench.action.closeOtherEditors");
                }
                break;
            }
        }
    }

    private runVSCodeCommand = async (commandName: string, ...args: unknown[]): Promise<unknown> => {
        const res = await vscode.commands.executeCommand(commandName, ...args);
        return res;
    };

    private uploadDocumentChangesToNeovim = async (): Promise<void> => {
        const requests: [string, unknown[]][] = [];
        let updateCursor = false;
        const activeUri = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.document.uri.toString()
            : undefined;

        for (const [uri, changes] of this.documentChangesInInsertMode) {
            this.documentChangesInInsertMode.set(uri, []);
            const document = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri);
            if (!document) {
                continue;
            }
            const eol = document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
            const buf = this.uriToBuffer.get(uri);
            if (!buf) {
                continue;
            }
            if (uri === activeUri) {
                updateCursor = true;
            }
            if (!changes.length) {
                continue;
            }
            const bufLinesRequests: [string, unknown[]][] = [];
            const versionChanges: DocumentChange[][] = [];
            for (const change of changes) {
                const diff = change.newEnd - change.end;
                if (Math.abs(diff) > 0) {
                    // should be fast
                    const prevVersionChanges = versionChanges.slice(0, change.version);
                    // for... in will give non empty indexes
                    for (const idx in prevVersionChanges) {
                        const p = prevVersionChanges[idx];
                        if (!p) {
                            continue;
                        }
                        for (const c of p) {
                            if (!c || c.start <= change.start) {
                                continue;
                            }
                            c.start += diff;
                            c.end += diff;
                            c.newStart += diff;
                            c.newEnd += diff;
                        }
                    }
                }
                if (!versionChanges[change.version]) {
                    versionChanges[change.version] = [];
                }
                versionChanges[change.version].push(change);
            }
            // each subsequent nvim_buf_set_lines uses the results of previous nvim_buf_set_lines, so we must sort them
            // according to the start range & version (lower version comes first) and increase line diff for next change
            const sorted = changes.sort((a, b) =>
                a.start < b.start
                    ? -1
                    : a.start > b.start
                    ? 1
                    : a.version < b.version
                    ? -1
                    : a.version > b.version
                    ? 1
                    : 0,
            );
            for (const change of sorted) {
                const text = document.getText(new vscode.Range(change.newStart, 0, change.newEnd, 99999));
                bufLinesRequests.push([
                    "nvim_buf_set_lines",
                    [buf.id, change.start, change.end + 1, false, text.split(eol)],
                ]);
            }
            const bufTick = await buf.changedtick;
            // const bufTick = this.skipBufferTickUpdate.get(buf.id) || 0;
            this.skipBufferTickUpdate.set(buf.id, bufTick + bufLinesRequests.length);
            requests.push(...bufLinesRequests);
        }
        if (updateCursor && vscode.window.activeTextEditor) {
            const cursorScreenRow =
                vscode.window.activeTextEditor.selection.active.line -
                vscode.window.activeTextEditor.visibleRanges[0].start.line;
            requests.push(
                [
                    "nvim_win_set_cursor",
                    [
                        0,
                        [
                            vscode.window.activeTextEditor.selection.active.line + 1,
                            vscode.window.activeTextEditor.selection.active.character,
                        ],
                    ],
                ],
                ["nvim_call_function", ["VSCodeAlignScreenRow", [cursorScreenRow + 1]]],
            );
        }
        await this.client.callAtomic(requests);
    };

    private onEscapeKeyCommand = async (): Promise<void> => {
        if (!this.isInit) {
            return;
        }
        if (this.isInsertMode) {
            this.leaveMultipleCursorsForVisualMode = false;
            await this.uploadDocumentChangesToNeovim();
        }
        await this.client.input("<Esc>");
        // const buf = await this.client.buffer;
        // const lines = await buf.lines;
        // console.log("====LINES====");
        // console.log(lines.join("\n"));
        // console.log("====END====");
    };

    private onCmdChange = async (e: string, complete: boolean): Promise<void> => {
        let keys = "<C-u>" + this.normalizeString(e);
        if (complete) {
            keys += "<Tab>";
        }
        await this.client.input(keys);
    };

    private onCmdCancel = async (): Promise<void> => {
        vscode.commands.executeCommand("setContext", "neovim.cmdLine", false);
        await this.client.input("<Esc>");
    };

    private onCmdAccept = (): void => {
        this.client.input("<CR>");
    };

    /// SCROLL COMMANDS ///
    private scrollPage = (by: "page" | "halfPage", to: "up" | "down"): void => {
        vscode.commands.executeCommand("editorScroll", { to, by, revealCursor: true });
    };

    private scrollLine = (to: "up" | "down"): void => {
        vscode.commands.executeCommand("editorScroll", { to, by: "line", revealCursor: false });
    };

    private goToLine = (to: "top" | "middle" | "bottom"): void => {
        const e = vscode.window.activeTextEditor;
        if (!e) {
            return;
        }
        const topVisible = e.visibleRanges[0].start.line;
        const bottomVisible = e.visibleRanges[0].end.line;
        const lineNum =
            to === "top"
                ? topVisible
                : to === "bottom"
                ? bottomVisible
                : Math.floor(topVisible + (bottomVisible - topVisible) / 2);
        const line = e.document.lineAt(lineNum);
        e.selections = [
            new vscode.Selection(
                lineNum,
                line.firstNonWhitespaceCharacterIndex,
                lineNum,
                line.firstNonWhitespaceCharacterIndex,
            ),
        ];
    };

    // zz, zt, zb and others
    private revealLine = (at: "center" | "top" | "bottom", resetCursor = false): void => {
        const e = vscode.window.activeTextEditor;
        if (!e) {
            return;
        }
        const cursor = e.selection.active;
        vscode.commands.executeCommand("revealLine", { lineNumber: cursor.line, at });
        // z<CR>/z./z-
        if (resetCursor) {
            const line = e.document.lineAt(cursor.line);
            e.selections = [
                new vscode.Selection(
                    cursor.line,
                    line.firstNonWhitespaceCharacterIndex,
                    cursor.line,
                    line.firstNonWhitespaceCharacterIndex,
                ),
            ];
        }
    };
}
