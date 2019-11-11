import { spawn, ChildProcess } from "child_process";
import path from "path";

import vscode from "vscode";
import throttle from "lodash/throttle";
import { attach, Buffer as NeovimBuffer, NeovimClient } from "neovim";
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

const NVIM_WIN_HEIGHT = 100;
const NVIM_WIN_WIDTH = 1000;

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
     * Current active buffer in neovim
     */
    private currentNeovimBuffer?: NeovimBuffer;
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
    private bufferChangesInInsertMode: Map<string, Array<[string, VimValue[]]>> = new Map();
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
     * Tracks previous documnet line count before documnet change
     * In multiline replace there is no way to know if the operation reduced total number of lines or not
     */
    private documentLines: Map<string, number> = new Map();
    /**
     * Vim modes
     */
    private vimModes: Map<string, CursorMode | OtherMode> = new Map();
    private documentHighlightProvider: HighlightProvider;

    private editorVisibleLines: WeakMap<vscode.TextEditor, { lines: number; topLine: number }> = new WeakMap();

    private nvimAttachWaiter: Promise<void> = Promise.resolve();
    private isInit = false;

    private nvimRealLinePosition = 0;
    private nvimRealColPosition = 0;

    private nvimIsCmdLine = false;

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
        this.documentHighlightProvider = new HighlightProvider(highlightsConfiguration);
        this.neovimExtensionsPath = path.join(extensionPath, "vim", "*.vim");
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand));
        this.disposables.push(vscode.workspace.onDidOpenTextDocument(this.onOpenTextDocument));
        this.disposables.push(vscode.workspace.onDidCloseTextDocument(this.onCloseTextDocument));
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument));
        this.disposables.push(vscode.window.onDidChangeVisibleTextEditors(this.onChangedEdtiors));
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(this.onChangedActiveEditor));
        this.disposables.push(vscode.window.onDidChangeTextEditorSelection(this.onChangeSelection));
        this.disposables.push(vscode.window.onDidChangeTextEditorVisibleRanges(this.onChangeVisibleRange));
        this.typeHandlerDisplose = vscode.commands.registerTextEditorCommand("type", this.onVSCodeType);

        // scroll commands, better to manage them on vscode side
        // !note: zz, zt, zb and others are being sent from neovim through RPC request
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-d", this.scrollHalfPageDown));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-u", this.scrollHalfPageUp));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-f", this.scrollPageDown));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-b", this.scrollPageUp));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.shift-h", this.goToFirstLine));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.shift-m", this.goToMiddleLine));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.shift-l", this.goToLastLine));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-e", this.scrollLineDownNoReveal));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-y", this.scrollLineUpNoReveal));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.cmdCompletion", this.onCmdCompletion));

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
        this.commandLine.onAccept = this.onCmdAccept;
        this.commandLine.onChanged = this.onCmdChange;
        this.commandLine.onCanceled = this.onCmdCancel;
        this.commandLine.onBacksapce = this.onCmdBackspace;
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
            // ext_multigrid: true,
            ext_popupmenu: true,
            ext_tabline: true,
            ext_wildmenu: true,
            /* eslint-enable @typescript-eslint/camelcase */
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        await this.nvimAttachWaiter;
        this.isInit = true;

        // vscode may not send ondocument opened event, send manually
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.isClosed) {
                continue;
            }
            await this.onOpenTextDocument(doc);
        }

        this.watchAndApplyNeovimEdits();

        this.onChangedEdtiors(vscode.window.visibleTextEditors);
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

    private onOpenTextDocument = async (e: vscode.TextDocument): Promise<void> => {
        const uri = e.uri.toString();
        // vscode may open documents which are not visible (WTF?), so don't try to process non visible documents
        const openedEditors = vscode.window.visibleTextEditors;
        if (!openedEditors.find(e => e.document.uri.toString() === uri)) {
            return;
        }
        await this.initBuffer(e);
    };

    private async initBuffer(e: vscode.TextDocument, cursor?: { line: number; char: number }): Promise<void> {
        const uri = e.uri.toString();
        if (this.uriToBuffer.has(uri)) {
            return;
        }
        this.documentHighlightProvider.clean(uri);
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
        this.currentNeovimBuffer = buf;
        this.managedBufferIds.add(buf.id);
        const eol = e.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
        const lines = e.getText().split(eol);

        const requests: [string, VimValue[]][] = [];
        requests.push(["nvim_win_set_buf", [0, buf]]);
        requests.push(["nvim_buf_set_lines", [buf, 0, 1, false, lines]]);
        if (cursor) {
            requests.push(["nvim_win_set_cursor", [0, [cursor.line + 1, cursor.char]]]);
        }
        requests.push(["nvim_buf_set_var", [buf, "vscode_controlled", true]]);
        requests.push(["nvim_buf_set_name", [buf, uri]]);
        requests.push(["nvim_call_function", ["VSCodeClearUndo", []]]);
        await this.client.callAtomic(requests);
        this.bufferIdToUri.set(buf.id, uri);
        this.uriToBuffer.set(uri, buf);
        buf.listen("lines", this.onNeovimBufferEvent);
    }

    private onChangeTextDocument = async (e: vscode.TextDocumentChangeEvent): Promise<void> => {
        await this.nvimAttachWaiter;
        const uri = e.document.uri.toString();
        const version = e.document.version;
        if (this.documentLastChangedVersion.get(uri) === version) {
            return;
        }
        const eol = e.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
        const requests: [string, VimValue[]][] = [];
        const buf = this.uriToBuffer.get(uri);
        if (!buf) {
            return;
        }
        const doc = e.document;
        const affectedRanges: Array<{ oldRange: vscode.Range; newRange: vscode.Range }> = [];
        for (const change of e.contentChanges) {
            const { range, text } = change;
            // if true when it's ordinary text change or newline insert
            if (change.range.isSingleLine) {
                const { line } = range.start;
                if (text === "\n" || text === "\r\n") {
                    // newline
                    affectedRanges.push({
                        oldRange: new vscode.Range(line, 0, line, 0),
                        newRange: new vscode.Range(line, 0, line + 1, 0),
                    });
                } else {
                    // vscode may insert snippet or some other mutliline text. In this case the range will be singleLine, but text itself with EOL
                    const changedTextByEol = text.split(eol);
                    affectedRanges.push({
                        oldRange: new vscode.Range(range.start.line, 0, range.end.line, 0),
                        newRange: new vscode.Range(
                            range.start.line,
                            0,
                            range.start.line + changedTextByEol.length - 1,
                            0,
                        ),
                    });
                }
            } else {
                // deleted line/newline
                if (text === "") {
                    affectedRanges.push({
                        oldRange: new vscode.Range(range.start.line, 0, range.end.line, 0),
                        newRange: new vscode.Range(range.start.line, 0, range.start.line, 0),
                    });
                } else {
                    const changedTextByEol = text.split(eol);
                    affectedRanges.push({
                        oldRange: new vscode.Range(range.start.line, 0, range.end.line, 0),
                        newRange: new vscode.Range(
                            range.start.line,
                            0,
                            range.start.line + changedTextByEol.length - 1,
                            0,
                        ),
                    });
                }
            }
        }
        if (!affectedRanges.length) {
            return;
        }

        // vscode may send few changes with overlapping ranges, e.g. line 46 grows to 46-47, line 47 grows to 47-48
        // we need to combine such changes and make one range, e.g. line 46-47 grows to 46-49
        const newRanges = affectedRanges
            .sort(({ oldRange: { start: { line: aStartLine } } }, { oldRange: { start: { line: bStartLine } } }) => {
                return aStartLine < bStartLine ? -1 : aStartLine > bStartLine ? 1 : 0;
            })
            .reduce(
                (all, curr) => {
                    const prevRange = all.slice(-1)[0];
                    if (!prevRange) {
                        all.push(curr);
                    } else {
                        if (
                            prevRange.oldRange.start.line <= curr.oldRange.start.line &&
                            Math.abs(prevRange.oldRange.end.line - curr.oldRange.start.line) <= 1
                        ) {
                            const prevRangeLineDiff = prevRange.newRange.end.line - prevRange.oldRange.end.line;
                            const newOldRange = new vscode.Range(
                                prevRange.oldRange.start.line,
                                0,
                                curr.oldRange.end.line,
                                0,
                            );
                            const newNewRange = new vscode.Range(
                                prevRange.newRange.start.line,
                                0,
                                curr.newRange.end.line + prevRangeLineDiff,
                                0,
                            );
                            all[all.length - 1] = {
                                oldRange: newOldRange,
                                newRange: newNewRange,
                            };
                        } else {
                            all.push(curr);
                        }
                    }
                    return all;
                },
                [] as typeof affectedRanges,
            );
        // step2 - go for each range again and increase each next to accumulated line difference
        // TODO: for some reason call_atomic doesn't work as expected with multiple nvim_buf_set_lines - subsequent calls are using resulted buffer of the previous call
        // Is it neovim bug?
        let accumulatedLineDifference = 0;
        for (const range of newRanges) {
            range.oldRange = new vscode.Range(
                range.oldRange.start.line + accumulatedLineDifference,
                0,
                range.oldRange.end.line + accumulatedLineDifference,
                0,
            );
            range.newRange = new vscode.Range(
                range.newRange.start.line + accumulatedLineDifference,
                0,
                range.newRange.end.line + accumulatedLineDifference,
                0,
            );
            accumulatedLineDifference += range.newRange.end.line - range.oldRange.end.line;
        }

        for (const range of newRanges) {
            const lastLine = doc.lineAt(range.newRange.end.line);
            const newLines = doc.getText(
                new vscode.Range(range.newRange.start.line, 0, range.newRange.end.line, lastLine.range.end.character),
            );
            const splitted = newLines.split(eol);
            requests.push([
                "nvim_buf_set_lines",
                [buf, range.oldRange.start.line, range.oldRange.end.line + 1, false, splitted],
            ]);
        }
        this.documentLines.set(uri, e.document.lineCount);
        if (this.isInsertMode) {
            const uriChanges = this.bufferChangesInInsertMode.get(uri) || [];
            uriChanges.push(...requests);
            this.bufferChangesInInsertMode.set(uri, uriChanges);
        } else {
            // !Note: Must be here
            // Neovim tries to preserve current active position when text is being changed by nonvim side
            // the problem comes with calling vscode insertLineBefore/insertLineAbove commands from neovim - the cursor position is messed
            // due async buffer request
            if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.toString() === uri) {
                requests.push([
                    "nvim_win_set_cursor",
                    [
                        0,
                        [
                            vscode.window.activeTextEditor.selection.active.line + 1,
                            vscode.window.activeTextEditor.selection.active.character,
                        ],
                    ],
                ]);
            }
            const tick = await buf.changedtick;
            this.skipBufferTickUpdate.set(buf.id, tick + newRanges.length);
            await this.client.callAtomic(requests);
        }
    };

    private onCloseTextDocument = async (e: vscode.TextDocument): Promise<void> => {
        await this.nvimAttachWaiter;
        const uri = e.uri.toString();
        const buf = this.uriToBuffer.get(uri);
        if (buf) {
            buf.unlisten("lines", this.onNeovimBufferEvent);
            await this.client.command(`bd${buf.id}`);
            this.bufferIdToUri.delete(buf.id);
            this.managedBufferIds.delete(buf.id);
            if (this.currentNeovimBuffer === buf) {
                this.currentNeovimBuffer = undefined;
            }
        }
        this.bufferChangesInInsertMode.delete(uri);
        this.uriToBuffer.delete(uri);
        this.documentLastChangedVersion.delete(uri);
        this.documentLines.delete(uri);
    };

    private onChangedEdtiors = (editors: vscode.TextEditor[]): void => {
        for (const editor of editors) {
            this.applyCursorStyleToEditor(editor, this.currentModeName);
        }
    };

    private onChangedActiveEditor = async (e: vscode.TextEditor | undefined): Promise<void> => {
        await this.nvimAttachWaiter;
        const buf = e ? this.uriToBuffer.get(e.document.uri.toString()) : undefined;
        if (buf) {
            // !important: need to update cursor in atomic operation
            const requests = [
                ["nvim_win_set_buf", [0, buf]],
                ["nvim_win_set_cursor", [0, [e!.selection.active.line + 1, e!.selection.active.character]]],
            ];
            await this.client.callAtomic(requests);
            // await this.client.request("nvim_win_set_buf", [0, buf]);
            this.currentNeovimBuffer = buf;
            // this.client.buffer = buf as any;
        } else if (e) {
            // vscode may open documents which are not visible (WTF?), but we're ingoring them in onOpenTextDocument
            // handle the case when such document becomes visible
            await this.initBuffer(e.document, { line: e.selection.active.line, char: e.selection.active.character });
        }
        // set correct scroll position & tab options in neovim buffer
        if (e) {
            // reapply cursor style
            this.applyCursorStyleToEditor(e, this.currentModeName);
            const cursor = e.selection.active;
            const visible = e.visibleRanges[0];
            const cursorScreenRow = cursor.line - visible.start.line;
            await this.updateNeovimHeight(visible.end.line - visible.start.line);
            await this.updateCursorPositionInNeovim(cursor.line, cursor.character, cursorScreenRow);
            // set buffer tab related options
            await this.setBufferTabOptions(e);
        }
    };

    private onChangeVisibleRange = async (e: vscode.TextEditorVisibleRangesChangeEvent): Promise<void> => {
        if (e.textEditor !== vscode.window.activeTextEditor) {
            return;
        }
        if (!e.visibleRanges[0]) {
            return;
        }
        if (this.isInsertMode) {
            return;
        }
        const visibleRange = e.visibleRanges[0];
        const currentVisibleLines = visibleRange.end.line - visibleRange.start.line;
        const prevVisibleLines = this.editorVisibleLines.get(e.textEditor) || { lines: 0, topLine: 0 };
        this.editorVisibleLines.set(e.textEditor, { lines: currentVisibleLines, topLine: visibleRange.start.line });
        if (this.shouldIgnoreMouseSelection) {
            return;
        }
        // const cursor = e.textEditor.selection.active;

        if (prevVisibleLines.lines === currentVisibleLines && !this.isInsertMode) {
            this.commitScrolling();
            // scrolling likely
            /*const diff = Math.abs(visibleRange.start.line - cursor.line);
            if (cursor.line > visibleRange.end.line && diff <= 5) {
                e.textEditor.selections = [
                    new vscode.Selection(
                        visibleRange.end.line,
                        cursor.character,
                        visibleRange.end.line,
                        cursor.character,
                    ),
                ];
            } else if (cursor.line < visibleRange.start.line && diff <= 5) {
                e.textEditor.selections = [
                    new vscode.Selection(
                        visibleRange.start.line,
                        cursor.character,
                        visibleRange.start.line,
                        cursor.character,
                    ),
                ];
            }*/
            // this.commitScrolling();
        } else {
            this.updateNeovimHeight(currentVisibleLines);
        }
    };

    private commitScrolling = throttle(
        () => {
            const e = vscode.window.activeTextEditor;
            if (!e) {
                return;
            }
            const visibleRange = e.visibleRanges[0];
            const cursor = e.selection.active;
            const cursorScreenRow = cursor.line - visibleRange.start.line;
            const uri = e.document.uri.toString();
            const buf = this.uriToBuffer.get(uri);
            if (!buf || buf !== this.currentNeovimBuffer) {
                return;
            }
            if (!this.isInsertMode) {
                this.alignScreenRowInNeovim(cursorScreenRow);
            }
        },
        1000,
        { leading: false },
    );

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
        if (this.shouldIgnoreMouseSelection) {
            return;
        }
        // must skip unknown kind
        if (!e.kind) {
            return;
        }
        // scroll commands are Keyboard kind
        /*if (e.kind === vscode.TextEditorSelectionChangeKind.Keyboard) {
            return;
        }*/
        const cursor = e.selections[0].active;
        const visibleRange = e.textEditor.visibleRanges[0];
        let shouldUpdateNeovimCursor = false;

        if (
            (cursor.line !== this.nvimRealLinePosition || cursor.character !== this.nvimRealColPosition) &&
            !this.isInsertMode
        ) {
            shouldUpdateNeovimCursor = true;
        }
        if (shouldUpdateNeovimCursor) {
            // when jumping to definition cursor line is new and visible range is old, we'll align neovim screen row after scroll
            const cursorScreenRow = visibleRange.contains(cursor) ? cursor.line - visibleRange.start.line : undefined;
            // when navigating to different file the onChangeSelection may come before onChangedTextEditor, so make sure we won't set cursor in the wrong buffer
            const uri = e.textEditor.document.uri.toString();
            const buf = this.uriToBuffer.get(uri);
            if (!buf || buf !== this.currentNeovimBuffer) {
                return;
            }
            this.updateCursorPositionInNeovim(cursor.line, cursor.character, cursorScreenRow);
        }
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
        if (this.isInsertMode) {
            return;
        }
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
                for (let line = firstLine; line <= lastLine; line++) {
                    this.documentHighlightProvider.removeLine(uri, line);
                }
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
                this.documentLines.set(uri, textEditor.document.lineCount);
            }
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private onNeovimNotification = (method: string, events: [string, ...any[]]): void => {
        if (method === "vscode-command") {
            const [vscodeCommand, ...commandArgs] = events;
            this.runVSCodeCommand(vscodeCommand, ...commandArgs);
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
            this.processRedrawBatch(batch);
        } else {
            this.currentRedrawBatch.push(...currRedrawNotifications);
        }
    };

    private processRedrawBatch = (batch: [string, ...unknown[]][]): void => {
        // eslint-disable-next-line no-constant-condition
        // process notification
        let newModeName: string | undefined;
        let shouldUpdateCursor = false;
        let shouldUpdateHighlights = false;
        // since neovim sets cmdheight=0 internally various vim plugins like easymotion are working incorrect and awaiting hitting enter
        // this is frustruating
        let acceptPrompt = false;
        const currentScreenHighlights: RedrawHighlightsUpdates = {};
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
                            this.documentHighlightProvider.addHighlightGroup(id, name, uiAttrs);
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
                    vscode.commands.executeCommand("setContext", "neovim.cmdLine", true);
                    this.commandLine.show();
                    this.commandLine.update(`${firstc}${prompt}${allContent}`);
                    break;
                }
                case "cmdline_hide": {
                    vscode.commands.executeCommand("setContext", "neovim.cmdLine", false);
                    this.commandLine.hide();
                    break;
                }
                case "cmdline_append": {
                    const [line] = firstArg as [string];
                    this.commandLine.append(line);
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
                    shouldUpdateCursor = true;
                    [newModeName] = firstArg as [string, never];
                    break;
                }
                case "grid_cursor_goto": {
                    shouldUpdateCursor = true;
                    break;
                }
                case "grid_line": {
                    for (const gridEvent of args) {
                        const [, row, colStart, cells] = gridEvent as [
                            number,
                            number,
                            number,
                            [string, number?, number?],
                        ];
                        let cellIdx = 0;

                        shouldUpdateHighlights = true;
                        const editor = vscode.window.activeTextEditor;
                        if (!editor) {
                            break;
                        }
                        // const scrollState = this.editorScollPositions.get(editor);
                        const finalRow = row;
                        // non editor row (neovim sends update for modeline/statusline)
                        if (editor.document.lineCount - 1 < finalRow) {
                            continue;
                        }
                        // store highlight updates, then apply then after flush()
                        let cellHlId = 0;
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        for (const [, hlId, repeat] of cells as any) {
                            if (hlId != null) {
                                cellHlId = hlId;
                            }
                            for (let i = 0; i < (repeat || 1); i++) {
                                const col = colStart + cellIdx;
                                const highlightGroup = this.documentHighlightProvider.getHighlightGroupName(cellHlId);
                                if (!currentScreenHighlights[finalRow]) {
                                    currentScreenHighlights[finalRow] = {};
                                }
                                if (!currentScreenHighlights[finalRow][col]) {
                                    currentScreenHighlights[finalRow][col] = "remove";
                                }
                                if (highlightGroup) {
                                    currentScreenHighlights[finalRow][col] = highlightGroup;
                                }
                                cellIdx++;
                            }
                        }
                    }
                    break;
                }
            }
        }
        this.applyRedrawUpdate(
            newModeName,
            shouldUpdateCursor,
            shouldUpdateHighlights,
            currentScreenHighlights,
            acceptPrompt,
        );
    };

    private applyRedrawUpdate = async (
        newModeName: string | undefined,
        updateCursor: boolean,
        applyHighlights: boolean,
        highlightUpdates: RedrawHighlightsUpdates,
        acceptPrompt: boolean,
    ): Promise<void> => {
        const prevModeName = this.currentModeName;
        if (newModeName) {
            this.handleModeChange(newModeName);
        }
        if (updateCursor) {
            // todo: investigate if it's possible to not call nvim_win_get_cursor()/winline(). This probably will require cursor tracking (what to do when where won't be grid_scroll event?)
            // we need to know if current mode is blocking otherwise nvim_win_get_cursor/nvim_call_function will stuck until unblock
            const mode = await this.client.mode;
            if (!this.nvimIsCmdLine && !mode.blocking) {
                const requests: [string, unknown[]][] = [["nvim_win_get_cursor", [0]]];
                if (mode.mode === "v" || mode.mode === "V" || mode.mode.charCodeAt(0) === 22) {
                    requests.push(["nvim_call_function", ["getpos", ["v"]]]);
                }
                const [[[realLine1Based, realCol], visualOrCursorPos1Based]] = await this.client.callAtomic(requests);
                // const [realLine1based, realCol] = await this.client.request("nvim_win_get_cursor", [0]);
                // const response = await this.client.callAtomic([
                //     ["nvim_win_get_cursor", [0]],
                //     ["nvim_call_function", ["winline", []]],
                // ]);
                // const [[[realLine1based, realCol], screenRow1based]] = response;
                // currentScreenRow = screenRow1based - 1;
                const newCursorLine = realLine1Based - 1;
                const newCursorCol = realCol;
                this.updateCursorPosInActiveEditor(
                    newCursorLine,
                    newCursorCol,
                    mode.mode,
                    visualOrCursorPos1Based,
                    // force update cursor to clear current selections when going off from the visual modes
                    prevModeName === "visual" && newModeName !== "visual",
                );
            }
        }
        if (applyHighlights) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            const topVisibleLine = editor.visibleRanges[0].start.line;
            const bottomVisibleLine = editor.visibleRanges[0].end.line;

            const uri = editor.document.uri.toString();

            // clean highlights from out-viewport range
            for (let i = 0; i < topVisibleLine; i++) {
                this.documentHighlightProvider.removeLine(uri, i);
            }
            for (let i = bottomVisibleLine + 1; i < editor.document.lineCount - 1; i++) {
                this.documentHighlightProvider.removeLine(uri, i);
            }
            for (const [lineId, updates] of Object.entries(highlightUpdates)) {
                for (const [colId, group] of Object.entries(updates)) {
                    if (group === "remove") {
                        this.documentHighlightProvider.remove(
                            uri,
                            topVisibleLine + parseInt(lineId, 10),
                            parseInt(colId, 10),
                        );
                    } else {
                        this.documentHighlightProvider.add(
                            uri,
                            group,
                            topVisibleLine + parseInt(lineId, 10),
                            parseInt(colId, 10),
                        );
                    }
                }
            }
            this.applyHighlightsToDocument(editor.document);
        }
        if (acceptPrompt) {
            this.client.input("<CR>");
        }
    };

    private applyHighlightsToDocument = (document: vscode.TextDocument): void => {
        const allUriEditors = vscode.window.visibleTextEditors.filter(
            e => e.document.uri.toString() === document.uri.toString(),
        );
        const highlights = this.documentHighlightProvider.provideDocumentHighlights(document);
        if (!highlights.length) {
            return;
        }
        for (const editor of allUriEditors) {
            for (const [decorator, ranges] of highlights) {
                editor.setDecorations(decorator, ranges);
            }
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
        if (!vscode.window.activeTextEditor) {
            return;
        }
        vscode.commands.executeCommand("setContext", "neovim.mode", modeName);
        this.applyCursorStyleToEditor(vscode.window.activeTextEditor, modeName);
    };

    private setBufferTabOptions = async (editor: vscode.TextEditor): Promise<void> => {
        const requests: VimValue[] = [];
        const {
            options: { insertSpaces, tabSize },
        } = editor;
        const buf = this.uriToBuffer.get(editor.document.uri.toString());
        if (!buf) {
            return;
        }
        requests.push(["nvim_buf_set_option", [buf, "expandtab", insertSpaces]]);
        requests.push(["nvim_buf_set_option", [buf, "tabstop", tabSize]]);
        requests.push(["nvim_buf_set_option", [buf, "shiftwidth", tabSize]]);
        requests.push(["nvim_buf_set_option", [buf, "softtabstop", tabSize]]);
        await this.client.callAtomic(requests);
    };

    private updateCursorPositionInNeovim = async (
        line: number,
        col: number,
        forceScreenRow?: number,
    ): Promise<void> => {
        if (this.nvimRealLinePosition !== line || this.nvimRealColPosition !== col) {
            await this.client.request("nvim_win_set_cursor", [0, [line + 1, col]]);
        }
        if (forceScreenRow) {
            await this.alignScreenRowInNeovim(forceScreenRow);
        }
    };

    private alignScreenRowInNeovim = async (screenRow: number): Promise<void> => {
        const screenRow1Based = await this.client.callFunction("winline");
        const nvimScreenRow0based = (screenRow1Based as number) - 1;
        if (nvimScreenRow0based === screenRow) {
            return;
        }
        const diff = Math.abs(nvimScreenRow0based - screenRow);
        let keys = "";
        if (screenRow - nvimScreenRow0based < 0) {
            // move screenrow top
            keys = diff > 1 ? `${diff}<C-e>` : "<C-e>";
        } else {
            // move screenrow down
            keys = diff > 1 ? `${diff}<C-y>` : "<C-y>";
        }
        await this.client.input(keys);
    };

    private updateNeovimHeight = async (height: number): Promise<void> => {
        if (height < 10) {
            height = 10;
        } else {
            // add additional height to compenstate statusline/cmdline
            height += 2;
        }
        await this.client.request("nvim_win_set_height", [0, height]);
    };

    private isVisualMode(modeShortName: string): boolean {
        return modeShortName === "v" || modeShortName === "V" || modeShortName.charCodeAt(0) === 22;
    }

    /**
     * Update cursor in active editor. Coords are zero based
     */
    private updateCursorPosInActiveEditor = (
        newLine: number,
        newCol: number,
        mode: string,
        visualStart?: [number, number, number, number],
        forceUpdate = false,
    ): void => {
        // if (this.isInsertMode) {
        // return;
        // }
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        this.nvimRealLinePosition = newLine;
        this.nvimRealColPosition = newCol;
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
                if (newCol >= visualStartChar) {
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
                    if (newCol >= visualStartChar) {
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
        if (visibleRange.contains(revealCursor)) {
            // always try to reveal even if in visible range to reveal horizontal scroll
            editor.revealRange(
                new vscode.Range(revealCursor.active, revealCursor.active),
                vscode.TextEditorRevealType.Default,
            );
        } else if (revealCursor.active.line < visibleRange.start.line) {
            const revealType =
                visibleRange.start.line - revealCursor.active.line >= visibleLines / 2 ? "center" : "top";
            vscode.commands.executeCommand("revealLine", { lineNumber: revealCursor.active.line, at: revealType });
        } else if (revealCursor.active.line > visibleRange.end.line) {
            const revealType =
                revealCursor.active.line - visibleRange.end.line >= visibleLines / 2 ? "center" : "bottom";
            vscode.commands.executeCommand("revealLine", { lineNumber: revealCursor.active.line, at: revealType });
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

    private async attachNeovimExternalBuffer(name: string, id: number): Promise<void> {
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
                const editor = await vscode.window.showTextDocument(doc);
                // using replace produces ugly selection effect, try to avoid it by using insert
                editor.edit(b => b.insert(new vscode.Position(0, 0), lines.join("\n")));
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
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active, false);
        }
    }

    /**
     *
     * @param hlGroupName VIM HL Group name
     * @param decorations Text decorations, the format is [[lineNum, [colNum, text][]]]
     */
    private applyTextDecorations(hlGroupName: string, decorations: [string, [number, string][]][]): void {
        const decorator = this.documentHighlightProvider.getDecoratorForHighlightGroup(hlGroupName);
        if (!decorator) {
            return;
        }
        const conf = this.documentHighlightProvider.getDecoratorOptions(decorator);
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
                const res = await this.runVSCodeCommand(vscodeCommand, ...commandArgs);
                // slightly delay sending response. Seems awaiting executeCommand doesn't garantue it was done
                // await new Promise(res => setTimeout(res, 20));
                result = res;
            } else if (eventName === "vscode-range-command") {
                const [vscodeCommand, line1, line2, ...commandArgs] = eventArgs;
                if (vscode.window.activeTextEditor) {
                    this.shouldIgnoreMouseSelection = true;
                    const prevSelections = [...vscode.window.activeTextEditor.selections];
                    vscode.window.activeTextEditor.selections = [
                        new vscode.Selection(line2 as number, 0, ((line1 as number) - 1) as number, 0),
                    ];
                    const res = await this.runVSCodeCommand(vscodeCommand, ...commandArgs);
                    vscode.window.activeTextEditor.selections = prevSelections;
                    this.shouldIgnoreMouseSelection = false;
                    result = res;
                }
            } else if (eventName === "vscode-neovim") {
                const [command, ...commandArgs] = eventArgs;
                if (command === "external-buffer") {
                    const [name, idStr] = commandArgs as [string, string];
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
                            await this.attachNeovimExternalBuffer(name, id);
                        }
                    } else {
                        const uri = this.bufferIdToUri.get(id);
                        if (uri) {
                            await vscode.window.showTextDocument(vscode.Uri.parse(uri));
                        }
                    }
                } else if (command === "notify-blocking") {
                    const [isBlocking, bufCursor] = commandArgs as [number, [number, number], number];
                    if (isBlocking) {
                        this.nvimRealLinePosition = bufCursor[0] - 1;
                        this.nvimRealColPosition = bufCursor[1];
                        this.nvimIsCmdLine = true;
                    } else {
                        this.nvimIsCmdLine = false;
                    }
                } else if (command === "text-decorations") {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const [hlName, cols] = commandArgs as any;
                    this.applyTextDecorations(hlName, cols);
                } else if (command === "reveal") {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const [at, updateCursor] = commandArgs as any;
                    this.revealLine(at, !!updateCursor);
                } else if (command === "visual-edit") {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const [append, visualMode] = commandArgs as any;
                    this.prepareForMultiCursorEditingFromVisualMode(!!append, visualMode);
                }
            }
            response.send(result || "", false);
        } catch (e) {
            response.send(e.message, true);
        }
    };

    private runVSCodeCommand = async (commandName: string, ...args: unknown[]): Promise<unknown> => {
        const res = await vscode.commands.executeCommand(commandName, ...args);
        return res;
    };

    private onEscapeKeyCommand = async (): Promise<void> => {
        if (!this.isInit) {
            return;
        }
        if (this.isInsertMode) {
            this.leaveMultipleCursorsForVisualMode = false;
            const requests: [string, VimValue[]][] = [];
            for (const [uri, changes] of this.bufferChangesInInsertMode) {
                const buf = this.uriToBuffer.get(uri);
                if (!buf) {
                    continue;
                }

                // neovim will send _lines event for every nvim_buf_set_lines call
                // since we did changes on vscode we're not intersted in them
                const bufTick = this.skipBufferTickUpdate.get(buf.id) || 0;
                this.skipBufferTickUpdate.set(buf.id, bufTick + changes.length);
                requests.push(...changes);
            }
            this.bufferChangesInInsertMode.clear();
            // update cursor
            if (vscode.window.activeTextEditor) {
                requests.push([
                    "nvim_win_set_cursor",
                    [
                        0,
                        [
                            vscode.window.activeTextEditor.selection.active.line + 1,
                            vscode.window.activeTextEditor.selection.active.character,
                        ],
                    ],
                ]);
            }
            await this.client.callAtomic(requests);
            if (vscode.window.activeTextEditor) {
                const cursorScreenRow =
                    vscode.window.activeTextEditor.selection.active.line -
                    vscode.window.activeTextEditor.visibleRanges[0].start.line;
                await this.alignScreenRowInNeovim(cursorScreenRow);
            }
        }
        await this.client.input("<Esc>");
        // const buf = await this.client.buffer;
        // const lines = await buf.lines;
        // console.log(lines);
    };

    private onCmdChange = async (e: string): Promise<void> => {
        await this.client.input(this.normalizeKey(e.slice(-1)));
    };

    private onCmdBackspace = async (): Promise<void> => {
        await this.client.input("<BS>");
    };

    private onCmdCancel = async (): Promise<void> => {
        vscode.commands.executeCommand("setContext", "neovim.cmdLine", false);
        await this.client.input("<Esc>");
    };

    private onCmdAccept = (): void => {
        this.client.input("<CR>");
    };

    private onCmdCompletion = (): void => {
        this.client.input("<tab>");
    };

    /// SCROLL COMMANDS ///
    private scrollPageUp = (): void => {
        // !note vim doesn't move cursor if there is already on first page. somehow aligned to vscode behavior
        vscode.commands.executeCommand("editorScroll", { to: "up", by: "page", revealCursor: true });
    };

    private scrollPageDown = (): void => {
        // !note vim moves cursor to the last line, aligned with vscode if scrollBeyondlastLine = true
        vscode.commands.executeCommand("editorScroll", { to: "down", by: "page", revealCursor: true });
    };

    private scrollHalfPageUp = (): void => {
        // !note: on first page vim moves cursor to the center, then to the top, vscode doesn't move
        vscode.commands.executeCommand("editorScroll", { to: "up", by: "halfPage", revealCursor: true });
    };

    private scrollHalfPageDown = (): void => {
        // !note: on last page vim cursor to the center, then to the bottom, vscode doesn't move
        vscode.commands.executeCommand("editorScroll", { to: "down", by: "halfPage", revealCursor: true });
    };

    private scrollLineUpNoReveal = (): void => {
        vscode.commands.executeCommand("editorScroll", { to: "up", by: "line", revealCursor: false });
    };

    private scrollLineDownNoReveal = (): void => {
        vscode.commands.executeCommand("editorScroll", { to: "down", by: "line", revealCursor: false });
    };

    // go to first visible line, first non space character
    private goToFirstLine = (): void => {
        const e = vscode.window.activeTextEditor;
        if (!e) {
            return;
        }
        const topVisible = e.visibleRanges[0].start.line;
        const line = e.document.lineAt(topVisible);
        e.selections = [
            new vscode.Selection(
                topVisible,
                line.firstNonWhitespaceCharacterIndex,
                topVisible,
                line.firstNonWhitespaceCharacterIndex,
            ),
        ];
    };

    private goToMiddleLine = (): void => {
        const e = vscode.window.activeTextEditor;
        if (!e) {
            return;
        }
        const topVisible = e.visibleRanges[0].start.line;
        const bottomVisible = e.visibleRanges[0].end.line;
        const middleLine = Math.floor((bottomVisible - topVisible) / 2);
        const line = e.document.lineAt(middleLine);
        e.selections = [
            new vscode.Selection(
                middleLine,
                line.firstNonWhitespaceCharacterIndex,
                middleLine,
                line.firstNonWhitespaceCharacterIndex,
            ),
        ];
    };

    private goToLastLine = (): void => {
        const e = vscode.window.activeTextEditor;
        if (!e) {
            return;
        }
        const bottomVisible = e.visibleRanges[0].end.line - 1; // may scroll without -1
        const line = e.document.lineAt(bottomVisible);
        e.selections = [
            new vscode.Selection(
                bottomVisible,
                line.firstNonWhitespaceCharacterIndex,
                bottomVisible,
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
