import { spawn, ChildProcess } from "child_process";
import path from "path";

import vscode from "vscode";
import { attach, Buffer as NeovimBuffer, NeovimClient, Window } from "neovim";
import { VimValue } from "neovim/lib/types/VimValue";
import { ATTACH } from "neovim/lib/api/Buffer";
import diff, { Diff } from "fast-diff";

import { CommandLineController } from "./command_line";
import { StatusLineController } from "./status_line";
import { HighlightProvider, HighlightConfiguration } from "./highlight_provider";
import { CommandsController } from "./commands_controller";

interface EditRange {
    start: number;
    end: number;
    newStart: number;
    newEnd: number;
    type: "changed" | "removed" | "added";
}

// Copied from https://github.com/google/diff-match-patch/blob/master/javascript/diff_match_patch_uncompressed.js
function diffLineToChars(text1: string, text2: string): { chars1: string; chars2: string; lineArray: string[] } {
    const lineArray: string[] = []; // e.g. lineArray[4] == 'Hello\n'
    const lineHash: { [key: string]: number } = {}; // e.g. lineHash['Hello\n'] == 4

    // '\x00' is a valid character, but various debuggers don't like it.
    // So we'll insert a junk entry to avoid generating a null character.
    lineArray[0] = "";

    /**
     * Split a text into an array of strings.  Reduce the texts to a string of
     * hashes where each Unicode character represents one line.
     * Modifies linearray and linehash through being a closure.
     * @param {string} text String to encode.
     * @return {string} Encoded string.
     * @private
     */
    const linesToCharsMunge = (text: string, maxLines: number): string => {
        let chars = "";
        // Walk the text, pulling out a substring for each line.
        // text.split('\n') would would temporarily double our memory footprint.
        // Modifying text would create many large strings to garbage collect.
        let lineStart = 0;
        let lineEnd = -1;
        // Keeping our own length variable is faster than looking it up.
        let lineArrayLength = lineArray.length;
        while (lineEnd < text.length - 1) {
            lineEnd = text.indexOf("\n", lineStart);
            if (lineEnd == -1) {
                lineEnd = text.length - 1;
            }
            let line = text.substring(lineStart, lineEnd + 1);

            // eslint-disable-next-line no-prototype-builtins
            if (lineHash.hasOwnProperty ? lineHash.hasOwnProperty(line) : lineHash[line] !== undefined) {
                chars += String.fromCharCode(lineHash[line]);
            } else {
                if (lineArrayLength == maxLines) {
                    // Bail out at 65535 because
                    // String.fromCharCode(65536) == String.fromCharCode(0)
                    line = text.substring(lineStart);
                    lineEnd = text.length;
                }
                chars += String.fromCharCode(lineArrayLength);
                lineHash[line] = lineArrayLength;
                lineArray[lineArrayLength++] = line;
            }
            lineStart = lineEnd + 1;
        }
        return chars;
    };
    // Allocate 2/3rds of the space for text1, the rest for text2.
    const chars1 = linesToCharsMunge(text1, 40000);
    const chars2 = linesToCharsMunge(text2, 65535);
    return { chars1: chars1, chars2: chars2, lineArray: lineArray };
}

function prepareEditRangesFromDiff(diffs: Diff[]): EditRange[] {
    const ranges: EditRange[] = [];
    // 0 - not changed, diff.length is length of non changed lines
    // 1 - added, length is added lines
    // -1 removed, length is removed lines
    let oldIdx = 0;
    let newIdx = 0;
    let currRange: EditRange | undefined;
    let currRangeDiff = 0;
    for (let i = 0; i < diffs.length; i++) {
        const [diffRes, diffStr] = diffs[i];
        if (diffRes === 0) {
            if (currRange) {
                // const diff = currRange.newEnd - currRange.newStart - (currRange.end - currRange.start);
                if (currRange.type === "changed") {
                    // changed range is inclusive
                    oldIdx += 1 + (currRange.end - currRange.start);
                    newIdx += 1 + (currRange.newEnd - currRange.newStart);
                } else if (currRange.type === "added") {
                    // added range is non inclusive
                    newIdx += Math.abs(currRangeDiff);
                } else if (currRange.type === "removed") {
                    // removed range is non inclusive
                    oldIdx += Math.abs(currRangeDiff);
                }
                ranges.push(currRange);
                currRange = undefined;
                currRangeDiff = 0;
            }
            oldIdx += diffStr.length;
            newIdx += diffStr.length;
            // if first change is single newline, then it's being eaten into the equal diff. probably comes from optimization by trimming common prefix?
            // if (
            //     ranges.length === 0 &&
            //     diffStr.length !== 1 &&
            //     diffs[i + 1] &&
            //     diffs[i + 1][0] === 1 &&
            //     diffs[i + 1][1].length === 1 &&
            //     diffs[i + 1][1].charCodeAt(0) === 3
            // ) {
            //     oldIdx--;
            //     newIdx--;
            // }
        } else {
            if (!currRange) {
                currRange = {
                    start: oldIdx,
                    end: oldIdx,
                    newStart: newIdx,
                    newEnd: newIdx,
                    type: "changed",
                };
                currRangeDiff = 0;
            }
            if (diffRes === -1) {
                // handle single string change, the diff will be -1,1 in this case
                if (diffStr.length === 1 && diffs[i + 1] && diffs[i + 1][0] === 1 && diffs[i + 1][1].length === 1) {
                    i++;
                    continue;
                }
                currRange.type = "removed";
                currRange.end += diffStr.length - 1;
                currRangeDiff = -diffStr.length;
            } else {
                if (currRange.type === "removed") {
                    currRange.type = "changed";
                } else {
                    currRange.type = "added";
                }
                currRange.newEnd += diffStr.length - 1;
                currRangeDiff += diffStr.length;
            }
        }
    }
    if (currRange) {
        ranges.push(currRange);
    }
    return ranges;
}

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

// to not deal with screenrow positioning, we set height to high value and scrolloff to value / 2. so screenrow will be always constant
// big scrolloff is needed to make sure that editor visible space will be always within virtual vim boundaries, regardless of current
// cursor positioning
const NVIM_WIN_HEIGHT = 201;
const NVIM_WIN_WIDTH = 500;

export class NVIMPluginController implements vscode.Disposable {
    private isInsertMode = false;
    private isRecording = false;
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
    private documentChangesInInsertMode: Map<string, boolean> = new Map();
    private documentText: Map<string, string> = new Map();
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
     * Vim modes
     */
    private vimModes: Map<string, CursorMode | OtherMode> = new Map();
    private highlightProvider: HighlightProvider;

    private nvimInitPromise: Promise<void> = Promise.resolve();
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

    private cmdlineTimer?: NodeJS.Timeout;

    private editorChangedPromise?: Promise<void>;

    private skipJumpsForUris: Map<string, boolean> = new Map();

    private grids: Map<
        number,
        { winId: number; cursorLine: number; cursorPos: number; screenLine: number }
    > = new Map();

    public constructor(
        neovimPath: string,
        extensionPath: string,
        highlightsConfiguration: HighlightConfiguration,
        mouseSelection: boolean,
        useWsl: boolean,
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

        const args = [
            "-N",
            "--embed",
            "-c",
            useWsl ? `source $(wslpath '${this.neovimExtensionsPath}')` : `source ${this.neovimExtensionsPath}`,
        ];
        if (useWsl) {
            args.unshift(neovimPath);
        }
        if (parseInt(process.env.NEOVIM_DEBUG || "", 10) === 1) {
            args.push(
                "-u",
                "NONE",
                "--listen",
                `${process.env.NEOVIM_DEBUG_HOST || "127.0.0.1"}:${process.env.NEOVIM_DEBUG_PORT || 4000}`,
            );
        }
        this.nvimProc = spawn(useWsl ? "C:\\Windows\\system32\\wsl.exe" : neovimPath, args, {});
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
        let resolveInitPromise: () => void = () => {
            /* ignore */
        };
        this.nvimInitPromise = new Promise(res => {
            resolveInitPromise = res;
        });
        await this.client.setClientInfo("vscode-neovim", { major: 0, minor: 1, patch: 0 }, "embedder", {}, {});
        const channel = await this.client.channelId;
        await this.client.setVar("vscode_channel", channel);

        await this.client.uiAttach(NVIM_WIN_WIDTH, NVIM_WIN_HEIGHT, {
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
        const firstWin = await this.client.window;

        // create nvim external windows. each window is mapped to corresponding view column
        // each window has own grid. IDs are starting from 1000 with first win is 1000 and second win is 1002 (why?)
        const requests: [string, unknown[]][] = [
            ["nvim_set_var", ["vscode_primary_win", firstWin.id]],
            ["nvim_set_var", ["vscode_noeditor_buffer", this.noEditorBuffer.id]],
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
        const clearjumpRequests: [string, unknown[]][] = wins.map(w => [
            "nvim_win_set_var",
            [w.id, "vscode_clearjump", true],
        ]);
        await this.client.callAtomic(clearjumpRequests);

        let currColumn = 1;
        for (const w of wins) {
            this.editorColumnIdToWinId.set(currColumn, w.id);
            currColumn++;
        }

        this.watchAndApplyNeovimEdits();
        this.isInit = true;
        resolveInitPromise();
        for (const e of vscode.window.visibleTextEditors) {
            await this.initBuffer(e);
        }
        // this.onChangedEdtiors(vscode.window.visibleTextEditors);
        await this.onChangedActiveEditor(vscode.window.activeTextEditor, true);
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
        // this.documentChangesInInsertMode.set(uri, {});
        this.documentText.set(uri, e.document.getText());
        await this.nvimInitPromise;
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
        requests.push(["nvim_win_set_cursor", [winId, [cursor.line + 1, cursor.character]]]);
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
        await this.nvimInitPromise;
        const uri = e.document.uri.toString();
        const version = e.document.version;
        if (this.documentLastChangedVersion.get(uri) === version) {
            return;
        }
        // const eol = e.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
        const buf = this.uriToBuffer.get(uri);
        if (!buf) {
            return;
        }
        if (!this.managedBufferIds.has(buf.id)) {
            return;
        }
        const changed = this.documentChangesInInsertMode.get(uri);
        if (!changed) {
            this.documentChangesInInsertMode.set(uri, true);
        }
        if (!this.isInsertMode) {
            this.uploadDocumentChangesToNeovim();
        }
    };

    private onChangedEdtiors = async (): Promise<void> => {
        await this.nvimInitPromise;
        let resolvePromise = (): void => {
            /* ignore */
        };
        this.editorChangedPromise = new Promise(res => {
            resolvePromise = res;
        });
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
            requests.push(["nvim_win_set_var", [winId, "vscode_clearjump", true]]);
            requests.push(["nvim_win_set_buf", [winId, this.noEditorBuffer.id]]);
        }
        if (activeColumns.has(vscode.ViewColumn.One)) {
            requests.push(["nvim_call_function", ["VSCodeClearJumpIfFirstWin", []]]);
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
                this.documentText.delete(uri);
                this.documentLastChangedVersion.delete(uri);
            }
        }
        if (wipeoutBuffers.size) {
            await this.client.command(`bwipeout! ${[...wipeoutBuffers].join(" ")}`);
        }
        resolvePromise();
        this.editorChangedPromise = undefined;
    };

    private onChangedActiveEditor = async (e: vscode.TextEditor | undefined, init = false): Promise<void> => {
        // !Note called also when editor changes column
        // !Note. when moving editor to other column, first onChangedActiveEditor is called with existing editor opened
        // !in the destination pane, then onChangedEditors is fired, then onChangedActiveEditor with actual editor
        await this.nvimInitPromise;
        if (this.editorChangedPromise) {
            await this.editorChangedPromise;
        }

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
            requests.unshift(
                // !Note: required otherwise navigating through jump stack may lead to broken state when vscode switches to editor
                // !in the other column but neovim win thinks it has this editor active
                // !Note: not required if editor is forced to opened in the same column
                // ["nvim_win_set_buf", [winId, buf.id]],
                ["nvim_win_set_cursor", [winId, [e.selection.active.line + 1, e.selection.active.character]]],
            );
        }
        if (init) {
            requests.push(["nvim_call_function", ["VSCodeClearJumpIfFirstWin", []]]);
        }
        if (this.skipJumpsForUris.get(e.document.uri.toString())) {
            this.skipJumpsForUris.delete(e.document.uri.toString());
        } else {
            requests.push(["nvim_call_function", ["VSCodeStoreJumpForWin", [winId]]]);
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
    private onChangeSelection = (e: vscode.TextEditorSelectionChangeEvent): void => {
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

        // !Note: Seems view column checking is enough
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
        let createJumpEntry = !e.kind || e.kind === vscode.TextEditorSelectionChangeKind.Command;
        const skipJump = this.skipJumpsForUris.get(e.textEditor.document.uri.toString());
        if (skipJump) {
            createJumpEntry = false;
            this.skipJumpsForUris.delete(e.textEditor.document.uri.toString());
        }
        this.updateCursorPositionInNeovim(winId, cursor.line, cursor.character, createJumpEntry);

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
        if (!this.isInsertMode || this.isRecording) {
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
            const edits = this.pendingBufChangesQueue.splice(0);
            if (!edits.length) {
                let timeout: NodeJS.Timeout | undefined;
                this.bufQueuePromise = new Promise(res => {
                    this.resolveBufQueuePromise = res;
                    // not necessary to timeout at all, but let's make sure
                    // !note looks like needed - increasing value starting to produce buffer desync. Because of this?
                    timeout = setTimeout(res, 40);
                });
                await this.bufQueuePromise;
                if (timeout) {
                    clearTimeout(timeout);
                }
                this.bufQueuePromise = undefined;
                this.resolveBufQueuePromise = undefined;
            } else {
                const changes: Map<
                    string,
                    { lines: string[]; editor: vscode.TextEditor; changed: boolean }
                > = new Map();
                for (const { buffer, data, firstLine, lastLine, tick } of edits) {
                    const uri = this.bufferIdToUri.get(buffer.id);
                    if (!uri) {
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
                    let change:
                        | { lines: string[]; editor: vscode.TextEditor; changed: boolean }
                        | undefined = changes.get(uri);
                    if (!change) {
                        const eol = textEditor.document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
                        change = {
                            lines: textEditor.document.getText().split(eol),
                            editor: textEditor,
                            changed: false,
                        };
                        changes.set(uri, change);
                    }
                    const skipTick = this.skipBufferTickUpdate.get(buffer.id) || 0;
                    if (skipTick >= tick) {
                        continue;
                    }
                    // happens after undo
                    if (firstLine === lastLine && data.length === 0) {
                        continue;
                    }
                    change.changed = true;
                    // nvim sends following:
                    // 1. string change - firstLine is the changed line , lastLine + 1
                    // 2. cleaned line but not deleted - first line is the changed line, lastLine + 1, linedata is ""
                    // 3. newline insert - firstLine = lastLine and linedata is "" or new data
                    // 4. line deleted - firstLine is changed line, lastLine + 1, linedata is empty []
                    // LAST LINE is exclusive and can be out of the last editor line
                    if (firstLine !== lastLine && data.length === 1 && data[0] === "") {
                        // 2
                        for (let line = firstLine; line < lastLine; line++) {
                            change.lines[line] = "";
                        }
                    } else if (firstLine !== lastLine && !data.length) {
                        // 4
                        for (let line = 0; line < lastLine - firstLine; line++) {
                            change.lines.splice(firstLine, 1);
                        }
                    } else if (firstLine === lastLine) {
                        // 3
                        if (firstLine > change.lines.length) {
                            data.unshift("");
                        }
                        if (firstLine === 0) {
                            change.lines.unshift(...data);
                        } else {
                            change.lines = [
                                ...change.lines.slice(0, firstLine),
                                ...data,
                                ...change.lines.slice(firstLine),
                            ];
                        }
                    } else {
                        // 1 or 3
                        // handle when change is overflow through editor lines. E.g. pasting on last line.
                        // Without newline it will append to the current one
                        if (firstLine >= change.lines.length) {
                            data.unshift("");
                        }
                        change.lines = [...change.lines.slice(0, firstLine), ...data, ...change.lines.slice(lastLine)];
                        // for (let i = 0; i < data.length; i++) {
                        //     const str = data[i];
                        //     const line = firstLine + i;
                        //     if (line >= lastLine) {
                        //         change.lines = [...change.lines.slice(0, line), str, ...change.lines.slice(line + 1)];
                        //     } else if (typeof change.lines[line] === "undefined") {
                        //         change.lines.push(str);
                        //     } else {
                        //         change.lines[line] = str;
                        //     }
                        // }
                        // if (firstLine + data.length < lastLine) {
                        //     const reduceFrom = firstLine + data.length;
                        //     for (let line = firstLine + data.length; line < lastLine; line++) {
                        //         change.lines.splice(reduceFrom, 1);
                        //     }
                        // }
                    }
                }
                // replacing lines with WorkspaceEdit() moves cursor to the end of the line, unfortunately this won't work
                // const workspaceEdit = new vscode.WorkspaceEdit();
                try {
                    for (const [uri, change] of changes) {
                        const { editor, lines, changed } = change;
                        if (!changed) {
                            continue;
                        }
                        let oldText = editor.document.getText();
                        const eol = editor.document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
                        let newText = lines.join(eol);
                        // add few lines to the end otherwise diff may be wrong for a newline characters
                        oldText += `${eol}end${eol}end`;
                        newText += `${eol}end${eol}end`;
                        const diffPrepare = diffLineToChars(oldText, newText);
                        const d = diff(diffPrepare.chars1, diffPrepare.chars2);
                        const ranges = prepareEditRangesFromDiff(d);
                        if (!ranges.length) {
                            continue;
                        }
                        this.documentLastChangedVersion.set(uri, editor.document.version + 1);
                        const cursor = editor.selection.active;
                        const success = await editor.edit(builder => {
                            for (const range of ranges) {
                                const text = lines.slice(range.newStart, range.newEnd + 1);
                                if (range.type === "removed") {
                                    if (range.end >= editor.document.lineCount - 1 && range.start > 0) {
                                        const startChar = editor.document.lineAt(range.start - 1).range.end.character;
                                        builder.delete(new vscode.Range(range.start - 1, startChar, range.end, 999999));
                                    } else {
                                        builder.delete(new vscode.Range(range.start, 0, range.end + 1, 0));
                                    }
                                } else if (range.type === "changed") {
                                    builder.replace(
                                        new vscode.Range(range.start, 0, range.end, 999999),
                                        text.join("\n"),
                                    );
                                } else if (range.type === "added") {
                                    if (range.start >= editor.document.lineCount) {
                                        text.unshift(
                                            ...new Array(range.start - (editor.document.lineCount - 1)).fill(""),
                                        );
                                    } else {
                                        text.push("");
                                    }
                                    builder.replace(new vscode.Position(range.start, 0), text.join("\n"));
                                }
                            }
                        });
                        if (success) {
                            // workaround for cursor moving after inserting some text
                            // it's not the ideal solution since there is minor transition from selection to single cursor
                            // todo: another solution is to combine ranges and replacing text starting by prev line when need to insert something
                            if (!editor.selection.anchor.isEqual(editor.selection.active)) {
                                editor.selections = [new vscode.Selection(cursor, cursor)];
                            }
                            this.documentText.set(uri, editor.document.getText());
                            // since vscode breaks cursor positions in many cases, resync cursor
                            if (!this.isInsertMode) {
                                this.resyncCursor();
                            }
                        }
                    }
                    // if (workspaceEdit.size) {
                    //     await vscode.workspace.applyEdit(workspaceEdit);
                    // }
                } catch (e) {
                    await vscode.window.showErrorMessage(
                        "vscode-neovim: Error applying neovim edits, please report a bug, error: " + e.message,
                    );
                }
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
            const batch = [...this.currentRedrawBatch.splice(0), ...currRedrawNotifications];
            this.processRedrawBatch(batch);
        } else {
            this.currentRedrawBatch.push(...currRedrawNotifications);
        }
    };

    private processRedrawBatch = (batch: [string, ...unknown[]][]): void => {
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
                    const allContent = content.map(([, str]) => str).join("");
                    if (this.cmdlineTimer) {
                        clearTimeout(this.cmdlineTimer);
                        this.cmdlineTimer = undefined;
                        this.commandLine.show(allContent, firstc, prompt);
                    } else {
                        // if there is initial content and it's not currently displayed then it may come
                        // from some mapping. to prevent bad UI commandline transition we delay cmdline appearing here
                        if (allContent !== "" && !this.commandLine.isDisplayed) {
                            this.cmdlineTimer = setTimeout(() => this.showCmdOnTimer(allContent, firstc, prompt), 200);
                        } else {
                            this.commandLine.show(allContent, firstc, prompt);
                        }
                    }
                    break;
                }
                case "wildmenu_show": {
                    const [items] = firstArg as [string[]];
                    this.commandLine.setCompletionItems(items);
                    break;
                }
                case "cmdline_hide": {
                    if (this.cmdlineTimer) {
                        clearTimeout(this.cmdlineTimer);
                        this.cmdlineTimer = undefined;
                    } else {
                        this.commandLine.cancel();
                    }
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
                // nvim may not send grid_cursor_goto and instead uses grid_scroll along with grid_line
                case "grid_scroll": {
                    // we only update here for movements while in command line mode (e.g. incsearch) since CursorMoved autocmd event won't be fired this case
                    if (this.currentModeName === "cmdline_normal") {
                        for (const [grid] of args as [number, number, number, null, number, number, number][]) {
                            gridCursorUpdates.add(grid);
                        }
                    }
                    break;
                }
                case "grid_cursor_goto": {
                    for (const [grid, screenRow] of args as [number, number, number][]) {
                        const conf = this.grids.get(grid);
                        if (conf) {
                            conf.screenLine = screenRow;
                            gridCursorUpdates.add(grid);
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
                        const columnToWinId = [...this.editorColumnIdToWinId].find(([, id]) => id === gridConf.winId);
                        if (!columnToWinId) {
                            continue;
                        }
                        let cellIdx = 0;

                        const editor = vscode.window.visibleTextEditors.find(e => e.viewColumn === columnToWinId[0]);
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
        if (this.currentModeName.startsWith("cmdline")) {
            this.applyRedrawUpdateInCmdlineMode(newModeName, gridCursorUpdates, gridHighlights, acceptPrompt);
        } else {
            this.applyRedrawUpdate(newModeName, gridCursorUpdates, gridHighlights, acceptPrompt);
        }
    };

    private applyRedrawUpdate = (
        newModeName: string | undefined,
        cursorUpdates: Set<number>,
        highlightUpdates: Map<number, RedrawHighlightsUpdates>,
        acceptPrompt: boolean,
    ): void => {
        const editorColumnsToWin = [...this.editorColumnIdToWinId];
        const prevModeName = this.currentModeName;
        if (newModeName) {
            this.handleModeChange(newModeName);
            if (
                (prevModeName && prevModeName.startsWith("cmdline") && !newModeName.startsWith("cmdline")) ||
                newModeName === "visual"
            ) {
                this.resyncCursor();
            }
            // need to clear selection when going off from visual mode
            if (
                prevModeName === "visual" &&
                newModeName !== "visual" &&
                vscode.window.activeTextEditor &&
                vscode.window.activeTextEditor.viewColumn
            ) {
                const e = vscode.window.activeTextEditor;
                const winId = this.editorColumnIdToWinId.get(e.viewColumn!);
                const gridConf = [...this.grids].find(([, conf]) => conf.winId === winId);
                if (gridConf) {
                    this.updateCursorPosInEditor(
                        e,
                        gridConf[1].cursorLine,
                        gridConf[1].cursorPos,
                        newModeName,
                        undefined,
                        true,
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
                    const highlightLine = topScreenLine + parseInt(lineId, 10);
                    if (highlightLine < 0) {
                        continue;
                    }
                    if (group === "remove") {
                        this.highlightProvider.remove(grid, highlightLine, parseInt(colId, 10));
                    } else {
                        this.highlightProvider.add(grid, group, highlightLine, parseInt(colId, 10));
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

    // this is similar to applyRedrawUpdate() except it's called only when in cmdline mode
    // the difference is we must force update cursor position since it's not possible to resort only for grid_scroll/grid_cursor_goto events
    // and there is no autocmd for moving cursor while in cmdline mode
    // throttle should help with HL updates
    private applyRedrawUpdateInCmdlineMode = async (
        newModeName: string | undefined,
        cursorUpdates: Set<number>,
        highlightUpdates: Map<number, RedrawHighlightsUpdates>,
        acceptPrompt: boolean,
    ): Promise<void> => {
        const editorColumnsToWin = [...this.editorColumnIdToWinId];
        const prevModeName = this.currentModeName;
        if (newModeName) {
            this.handleModeChange(newModeName);
            if (prevModeName && prevModeName.startsWith("cmdline") && !newModeName.startsWith("cmdline")) {
                this.resyncCursor();
            }
        }
        if (cursorUpdates.size || highlightUpdates.size) {
            const syncCursorsGrids: Set<number> = new Set([...cursorUpdates, ...highlightUpdates.keys()]);
            // we need to know if current mode is blocking otherwise nvim_win_get_cursor/nvim_call_function will stuck until unblock
            const mode = await this.client.mode;
            if (!mode.blocking) {
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
                const result = (await this.client.callAtomic(requests)) as [[number, number][], unknown];
                // set cursor updates
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
                    this.updateCursorPosInEditor(editor, conf.cursorLine, conf.cursorPos, mode.mode);
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
                    const highlightLine = topScreenLine + parseInt(lineId, 10);
                    if (highlightLine < 0) {
                        continue;
                    }
                    if (group === "remove") {
                        this.highlightProvider.remove(grid, highlightLine, parseInt(colId, 10));
                    } else {
                        this.highlightProvider.add(grid, group, highlightLine, parseInt(colId, 10));
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
        if (this.isInsertMode && this.typeHandlerDisplose && !this.isRecording) {
            this.typeHandlerDisplose.dispose();
            this.typeHandlerDisplose = undefined;
        } else if (!this.isInsertMode && !this.typeHandlerDisplose) {
            this.typeHandlerDisplose = vscode.commands.registerTextEditorCommand("type", this.onVSCodeType);
            this.isRecording = false;
        }
        this.currentModeName = modeName;
        const e = vscode.window.activeTextEditor;
        if (!e) {
            return;
        }
        vscode.commands.executeCommand("setContext", "neovim.mode", modeName);
        this.applyCursorStyleToEditor(e, modeName);
    };

    private resyncCursor = async (): Promise<void> => {
        const e = vscode.window.activeTextEditor;
        if (!e || !e.viewColumn) {
            return;
        }
        const winId = this.editorColumnIdToWinId.get(e.viewColumn);
        if (!winId) {
            return;
        }
        const gridConf = [...this.grids].find(([, conf]) => conf.winId === winId);
        if (!gridConf) {
            return;
        }
        const [[mode, [line1based, col0based], screenLine1Based, visualStart]] = await this.client.callAtomic([
            ["nvim_get_mode", []],
            ["nvim_win_get_cursor", [winId]],
            ["nvim_call_function", ["winline", []]],
            ["nvim_call_function", ["getpos", ["v"]]],
        ]);
        gridConf[1].cursorLine = line1based - 1;
        gridConf[1].cursorPos = col0based;
        gridConf[1].screenLine = screenLine1Based - 1;
        this.updateCursorPosInEditor(
            e,
            gridConf[1].cursorLine,
            gridConf[1].cursorPos,
            mode.mode,
            visualStart,
            this.currentModeName === "visual",
        );
    };

    private updateCursorPositionInNeovim = async (
        winId: number,
        line: number,
        col: number,
        createJumpEntry = false,
    ): Promise<void> => {
        const requests: [string, unknown[]][] = [["nvim_win_set_cursor", [winId, [line + 1, col]]]];
        if (createJumpEntry) {
            requests.push(["nvim_call_function", ["VSCodeStoreJumpForWin", [winId]]]);
        }
        await this.client.callAtomic(requests);
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
        if (mode && this.isVisualMode(mode) && Array.isArray(visualStart) && !this.leaveMultipleCursorsForVisualMode) {
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
                const [name, idStr, expandTab, tabStop, isJumping] = args as [string, string, number, number, number];
                const id = parseInt(idStr, 10);
                if (!this.managedBufferIds.has(id) && !(name && /:\/\//.test(name))) {
                    await this.attachNeovimExternalBuffer(name, id, !!expandTab, tabStop);
                } else if (isJumping && name) {
                    // !Important: we only allow to open uri from neovim side when jumping. Otherwise it may break vscode editor management
                    // !and produce ugly switching effects
                    try {
                        let doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === name);
                        if (!doc) {
                            doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(name, true));
                        }
                        this.skipJumpsForUris.set(name, true);
                        await vscode.window.showTextDocument(doc, {
                            // viewColumn: vscode.ViewColumn.Active,
                            // !need to force editor to appear in the same column even if vscode 'revealIfOpen' setting is true
                            viewColumn: vscode.window.activeTextEditor
                                ? vscode.window.activeTextEditor.viewColumn
                                : vscode.ViewColumn.Active,
                            preserveFocus: false,
                            preview: false,
                        });
                    } catch {
                        // todo: show error
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
            case "notify-recording": {
                this.isRecording = true;
                break;
            }
            case "insert-line": {
                const [type] = args as ["before" | "after"];
                // set isInsertMode explicitly earlier to prevent newline uploading to neovim and cursor jumping
                this.isInsertMode = true;
                this.client.command("startinsert");
                vscode.commands.executeCommand(
                    type === "before" ? "editor.action.insertLineBefore" : "editor.action.insertLineAfter",
                );
                break;
            }
            case "cursor": {
                const [winId, mode, [line1based, col0based], visualStart] = args as [
                    number,
                    string,
                    [number, number],
                    [number, number, number, number],
                ];
                const gridConf = [...this.grids].find(([, val]) => val.winId === winId);
                if (!gridConf) {
                    break;
                }
                gridConf[1].cursorLine = line1based - 1;
                gridConf[1].cursorPos = col0based;
                const viewColumn = [...this.editorColumnIdToWinId].find(([, w]) => w === winId);
                if (!viewColumn) {
                    break;
                }

                const textEditor = vscode.window.visibleTextEditors.find(e => e.viewColumn === viewColumn[0]);
                if (textEditor) {
                    this.updateCursorPosInEditor(
                        textEditor,
                        gridConf[1].cursorLine,
                        gridConf[1].cursorPos,
                        mode,
                        // apply visual selection only in active editor for now
                        // !note: vim behaves differently
                        textEditor === vscode.window.activeTextEditor ? visualStart : undefined,
                    );
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

        for (const [uri, changed] of this.documentChangesInInsertMode) {
            if (!changed) {
                continue;
            }
            this.documentChangesInInsertMode.set(uri, false);
            let origText = this.documentText.get(uri);
            if (origText == null) {
                continue;
            }
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
            let newText = document.getText();
            this.documentText.set(uri, newText);

            // workaround about problem changing last line when it's empty
            // todo: it doesn't work if you just add empty line without changing it
            // if (origText.slice(-1) === "\n" || origText.slice(-1) === "\r\n") {
            // add few lines to the end otherwise diff may be wrong for a newline characters
            origText += `${eol}end${eol}end`;
            newText += `${eol}end${eol}end`;
            // }
            const diffPrepare = diffLineToChars(origText, newText);
            const d = diff(diffPrepare.chars1, diffPrepare.chars2);
            const ranges = prepareEditRangesFromDiff(d);
            if (!ranges.length) {
                continue;
            }
            // dmp.diff_charsToLines_(diff, diffPrepare.lineArray);
            const bufLinesRequests: [string, unknown[]][] = [];
            // each subsequent nvim_buf_set_lines uses the result of previous nvim_buf_set_lines so we must shift start/end
            let lineDiffForNextChange = 0;
            for (const range of ranges) {
                let text = document.getText(new vscode.Range(range.newStart, 0, range.newEnd, 999999)).split(eol);
                const start = range.start + lineDiffForNextChange;
                let end = range.end + lineDiffForNextChange;
                if (range.type === "removed") {
                    text = [];
                    end++;
                    lineDiffForNextChange--;
                } else if (range.type === "changed") {
                    // workaround for the diff issue when you put newline after the first line
                    // diff doesn't account this case
                    if ((newText.slice(-1) === "\n" || newText.slice(-1) === "\r\n") && !origText.includes(eol)) {
                        text.push("");
                    }
                    end++;
                } else if (range.type === "added") {
                    // prevent adding newline
                    if (range.start === 0 && !origText) {
                        end++;
                    }
                    lineDiffForNextChange++;
                    // if (text.slice(-1)[0] === "") {
                    //     text.pop();
                    // }
                    // text.push("\n");
                }
                bufLinesRequests.push(["nvim_buf_set_lines", [buf.id, start, end, false, text]]);
                lineDiffForNextChange += range.newEnd - range.newStart - (range.end - range.start);
            }
            const bufTick = await buf.changedtick;
            // const bufTick = this.skipBufferTickUpdate.get(buf.id) || 0;
            this.skipBufferTickUpdate.set(buf.id, bufTick + bufLinesRequests.length);
            requests.push(...bufLinesRequests);
        }
        if (!requests.length) {
            return;
        }

        if (updateCursor && vscode.window.activeTextEditor) {
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

    private showCmdOnTimer = (initialContent: string, firstc: string, prompt: string): void => {
        this.commandLine.show(initialContent, firstc, prompt);
        this.cmdlineTimer = undefined;
    };

    private onCmdChange = async (e: string, complete: boolean): Promise<void> => {
        let keys = "<C-u>" + this.normalizeString(e);
        if (complete) {
            keys += "<Tab>";
        }
        await this.client.input(keys);
    };

    private onCmdCancel = async (): Promise<void> => {
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
