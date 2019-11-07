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
const NVIM_WIN_WIDTH = 9999;

export class NVIMPluginController implements vscode.Disposable {
    private isInsertMode = false;

    private nvimProc: ChildProcess;
    private client: NeovimClient;

    private disposables: vscode.Disposable[] = [];
    private typeHandlerDisplose?: vscode.Disposable;

    /**
     * External buffer ids managed by vim, not vscode
     */
    private externalBufferIds: Set<number> = new Set();

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
     * Redraw notifications queue. The value is one single redraw batch (within flush)
     */
    private pendingRedrawNotificationsQueue: [string, ...unknown[]][][] = [];
    /**
     * Neovim API states that multiple redraw batches could be sent following flush() after last batch
     * Save current batch into temp variable
     */
    private currentRedrawBatch: [string, ...unknown[]][] = [];

    private redrawQueuePromise?: Promise<void>;
    private resolveRedrawQueuePromise?: () => void;

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
    /**
     * Current vim mode
     */
    private currentModeName = "";
    private documentHighlightProvider: HighlightProvider;

    private nvimAttachWaiter: Promise<void> = Promise.resolve();
    private isInit = false;

    private nvimRealLinePosition = 0;
    private nvimRealColPosition = 0;

    private neovimExtensionsPath: string;

    public constructor(neovimPath: string, extensionPath: string, highlightsConfiguration: HighlightConfiguration) {
        if (!neovimPath) {
            throw new Error("Neovim path is not defined");
        }
        this.documentHighlightProvider = new HighlightProvider(highlightsConfiguration);
        this.neovimExtensionsPath = path.join(extensionPath, "vim", "*.vim");
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand));
        this.disposables.push(vscode.workspace.onDidOpenTextDocument(this.onOpenTextDocument));
        this.disposables.push(vscode.workspace.onDidCloseTextDocument(this.onCloseTextDocument));
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument));
        this.disposables.push(vscode.window.onDidChangeVisibleTextEditors(this.onChangedEdtiors));
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(this.onChangedActiveEditor));
        this.disposables.push(vscode.window.onDidChangeTextEditorSelection(this.onChangeSelection));
        this.typeHandlerDisplose = vscode.commands.registerTextEditorCommand("type", this.onVSCodeType);

        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.cmdCompletion", this.onCmdCompletion));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.scrollUp", this.onScrollUpCommand));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.scrollDown", this.onScrollDownCommand));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.scrollHalfUp", this.onHalfScollUpCommand));
        this.disposables.push(
            vscode.commands.registerCommand("vscode-neovim.scrollHalfDown", this.onHalfScrollDownCommand),
        );
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-r", this.onCtrlR));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.ctrl-v", this.onCtrlV));

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
        this.commandLine.onAccept = this.onCmdAccept;
        this.commandLine.onChanged = this.onCmdChange;
        this.commandLine.onCanceled = this.onCmdCancel;
        this.commandLine.onBacksapce = this.onCmdBackspace;
        this.disposables.push(this.commandLine);
        this.disposables.push(this.statusLine);

        this.client.on("notification", this.onNeovimNotification);
        this.client.on("request", this.handleCustomRequest);
    }

    public async init(): Promise<void> {
        await this.client.setClientInfo(
            "vscode-neovim",
            { major: 0, minor: 1, patch: 0 },
            "embedder",
            {},
            {
                testmethod: {
                    async: true,
                },
            },
        );
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
        this.watchAndProcessNeovimNotifications();

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
        if (this.uriToBuffer.has(uri)) {
            return;
        }
        this.documentHighlightProvider.clean(uri);
        await this.nvimAttachWaiter;
        const buf = await this.client.createBuffer(true, true);
        if (typeof buf === "number") {
            // 0 is error
        } else {
            const eol = e.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
            const lines = e.getText().split(eol);

            const requests: [string, VimValue[]][] = [];
            requests.push(["nvim_buf_set_var", [buf, "vscode_controlled", true]]);
            requests.push(["nvim_buf_set_name", [buf, uri]]);
            requests.push(["nvim_buf_set_lines", [buf, 0, 1, false, lines]]);
            requests.push(["nvim_win_set_buf", [0, buf]]);
            requests.push(["nvim_call_function", ["VSCodeClearUndo", []]]);
            await this.client.callAtomic(requests);
            this.bufferIdToUri.set(buf.id, uri);
            this.uriToBuffer.set(uri, buf);
            buf.listen("lines", this.onNeovimBufferEvent);
        }
    };

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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await this.client.request("nvim_win_set_buf", [0, buf]);
            // this.client.buffer = buf as any;
        } else if (e) {
            // vscode may open documents which are not visible (WTF?), but we're ingoring them in onOpenTextDocument
            // handle the case when such document becomes visible
            await this.onOpenTextDocument(e.document);
        }
        // set correct scroll position & tab options in neovim buffer
        if (e) {
            // reapply cursor style
            this.applyCursorStyleToEditor(e, this.currentModeName);
            await this.updateCursorPositionInNeovim(e);
            // set buffer tab related options
            await this.setBufferTabOptions(e);
        }
    };

    // unfortunately it's messing with cursor navigation
    // private onChangeVisibleRange = async (e: vscode.TextEditorVisibleRangesChangeEvent) => {
    //     if (e.textEditor !== vscode.window.activeTextEditor) {
    //         return;
    //     }
    //     const range = e.visibleRanges[0];
    //     if (this.nvimRealLinePosition < range.start.line) {
    //         // scolled down
    //         await this.client.inputMouse("wheel", "down", "", 0, 0, 0);
    //     } else if (this.nvimRealLinePosition > range.end.line) {
    //         await this.client.inputMouse("wheel", "up", "", 0, 0, 0);
    //     }
    // };

    /**
     * Handle vscode selection change. This includes everything touching selection or cursor position, includes custom commands and selection = [] assignment
     */
    private onChangeSelection = async (e: vscode.TextEditorSelectionChangeEvent): Promise<void> => {
        const firstSelection = e.selections[0].active;
        if (
            firstSelection.line === this.nvimRealLinePosition &&
            firstSelection.character === this.nvimRealColPosition
        ) {
            return;
        }
        // Kind may be undefined when:
        // 1) opening file
        // 2) setting selection in code
        if (!e.kind || e.kind === vscode.TextEditorSelectionChangeKind.Keyboard) {
            return;
        }
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
        // support mouse visual selection
        if (
            e.kind === vscode.TextEditorSelectionChangeKind.Mouse &&
            (e.selections.length > 1 || !e.selections[0].active.isEqual(e.selections[0].anchor))
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
        } else {
            await this.updateCursorPositionInNeovim(e.textEditor);
        }
    };

    private onVSCodeType = (_editor: vscode.TextEditor, edit: vscode.TextEditorEdit, type: { text: string }): void => {
        if (!this.isInit) {
            return;
        }
        if (!this.isInsertMode) {
            this.client.input(type.text);
        } else {
            vscode.commands.executeCommand("default:type", { text: type.text });
        }
    };

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
                // wait 100ms for next tick. can be resolved earlier by notifying from onNeovimBufferEvent()
                let timeout: NodeJS.Timeout | undefined;
                this.bufQueuePromise = new Promise(res => {
                    this.resolveBufQueuePromise = res;
                    timeout = setTimeout(res, 100);
                });
                if (timeout) {
                    clearTimeout(timeout);
                }
                await this.bufQueuePromise;
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
                const textEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri);
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
                            endRangeLine >= textEditor.document.lineCount ? "" : "\n",
                        );
                    } else if (firstLine !== lastLine && (!data.length || (data.length === 1 && data[0] === ""))) {
                        // FIXME: {\n} - ci{ adding line
                        builder.replace(new vscode.Range(firstLine, 0, endRangeLine, endRangePos), "");
                    } else {
                        const lines = data.map((d: string) => d + "\n");
                        // remove last "\n" if end range is greather than existing ranges. otherwise vscode will insert new line
                        if (endRangeLine >= textEditor.document.lineCount && lines.length) {
                            const newLine = lines.pop()!.slice(0, -1);
                            lines.push(newLine);
                        }
                        // handle when change is overflow through editor lines. E.g. pasting on last line.
                        // Without newline it will append to the current one
                        if (firstLine >= textEditor.document.lineCount) {
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
            this.pendingRedrawNotificationsQueue.push([...this.currentRedrawBatch, ...currRedrawNotifications]);
            this.currentRedrawBatch = [];
            if (this.resolveRedrawQueuePromise) {
                this.resolveRedrawQueuePromise();
            }
        } else {
            this.currentRedrawBatch.push(...currRedrawNotifications);
        }
    };

    private watchAndProcessNeovimNotifications = async (): Promise<void> => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const batch = this.pendingRedrawNotificationsQueue.shift();
            if (!batch) {
                // wait 50ms for next tick. can be resolved earlier by notifying from onNeovimNotification()
                let timeout: NodeJS.Timeout | undefined;
                this.redrawQueuePromise = new Promise(res => {
                    this.resolveRedrawQueuePromise = res;
                    timeout = setTimeout(res, 50);
                });
                if (timeout) {
                    clearTimeout(timeout);
                }
                await this.redrawQueuePromise;
                this.redrawQueuePromise = undefined;
                this.resolveRedrawQueuePromise = undefined;
            } else {
                // process notification
                let newModeName: string | undefined;
                let shouldUpdateCursor = false;
                let shouldUpdateHighlights = false;
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
                            const [content] = firstArg as [any[]];
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
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const [, content] = firstArg as [never, any[], never];
                            // if (ui === "confirm" || ui === "confirmsub" || ui === "return_prompt") {
                            //     this.nextInputBlocking = true;
                            // }
                            let str = "";
                            if (content) {
                                for (const c of content) {
                                    const [, cmdStr] = c;
                                    if (cmdStr) {
                                        str += cmdStr;
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
                                        const highlightGroup = this.documentHighlightProvider.getHighlightGroup(
                                            cellHlId,
                                        );
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
                await this.applyRedrawUpdate(
                    newModeName,
                    shouldUpdateCursor,
                    shouldUpdateHighlights,
                    currentScreenHighlights,
                );
            }
        }
    };

    private applyRedrawUpdate = async (
        newModeName: string | undefined,
        updateCursor: boolean,
        applyHighlights: boolean,
        highlightUpdates: RedrawHighlightsUpdates,
    ): Promise<void> => {
        let currentScreenRow = 0;
        let newCursorLine = 0;
        let newCursorCol = 0;
        if (updateCursor || applyHighlights) {
            const response = await this.client.callAtomic([
                ["nvim_win_get_cursor", [0]],
                ["nvim_call_function", ["winline", []]],
            ]);
            const [[[realLine1based, realCol], screenRow1based]] = response;
            currentScreenRow = screenRow1based - 1;
            newCursorLine = realLine1based - 1;
            newCursorCol = realCol;
        }
        if (newModeName) {
            this.handleModeChange(newModeName);
        }
        if (updateCursor) {
            this.updateCursorPosInActiveEditor(newCursorLine, newCursorCol);
        }
        if (applyHighlights) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            // calculate top visitor buffer line. highlight updates are in screen row:col coordinates, but we need to convert them to line based
            const topVisibleBufferLine = this.nvimRealLinePosition - currentScreenRow;
            const bottomVisibleBufferLine = topVisibleBufferLine + 99;

            const uri = editor.document.uri.toString();

            for (let i = 0; i < topVisibleBufferLine; i++) {
                this.documentHighlightProvider.removeLine(uri, i);
            }
            // vim screen size may be different than editor size
            if (bottomVisibleBufferLine < editor.document.lineCount - 1) {
                for (let i = bottomVisibleBufferLine; i < editor.document.lineCount - 1; i++) {
                    this.documentHighlightProvider.removeLine(uri, i);
                }
            }
            for (const [lineId, updates] of Object.entries(highlightUpdates)) {
                for (const [colId, group] of Object.entries(updates)) {
                    if (group === "remove") {
                        this.documentHighlightProvider.remove(
                            uri,
                            topVisibleBufferLine + parseInt(lineId, 10),
                            parseInt(colId, 10),
                        );
                    } else {
                        this.documentHighlightProvider.add(
                            uri,
                            group,
                            topVisibleBufferLine + parseInt(lineId, 10),
                            parseInt(colId, 10),
                        );
                    }
                }
            }
            this.applyHighlightsToDocument(editor.document);
        }
    };

    private applyHighlightsToDocument = throttle((document: vscode.TextDocument) => {
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
    }, 20);

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

    private updateCursorPositionInNeovim = async (editor: vscode.TextEditor): Promise<void> => {
        await this.client.call("nvim_win_set_cursor", [
            0,
            [editor.selection.active.line + 1, editor.selection.active.character],
        ]);
    };

    private updateCursorPosInActiveEditor = (newLine: number, newCol: number): void => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        this.nvimRealLinePosition = newLine;
        this.nvimRealColPosition = newCol;
        const currentCursor = editor.selections[0].active;
        if (currentCursor.line === newLine && currentCursor.character === newCol && this.currentModeName !== "visual") {
            return;
        }
        editor.selections = [new vscode.Selection(newLine, newCol, newLine, newCol)];
        editor.revealRange(editor.selection, vscode.TextEditorRevealType.Default);
    };

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
        await vscode.window.showTextDocument(doc, vscode.ViewColumn.Active, false);
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
                await new Promise(res => setTimeout(res, 20));
                result = res;
            } else if (eventName === "vscode-neovim") {
                const [command, ...commandArgs] = eventArgs;
                if (command === "external-buffer") {
                    const [name, id] = commandArgs as [string, string];
                    await this.attachNeovimExternalBuffer(name, parseInt(id, 10));
                    result = "";
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
        }
        await this.client.input("<Esc>");
    };

    private onCmdChange = async (e: string): Promise<void> => {
        await this.client.input(e.slice(-1));
    };

    private onCmdBackspace = async (): Promise<void> => {
        await this.client.input("<BS>");
    };

    private onCmdCancel = async (): Promise<void> => {
        vscode.commands.executeCommand("setContext", "neovim.cmdLine", false);
        await this.client.input("<Esc>");
    };

    private onCmdAccept = async (): Promise<void> => {
        await this.client.input("<CR>");
    };

    private onCmdCompletion = async (): Promise<void> => {
        await this.client.input("<Tab>");
    };

    private onHalfScollUpCommand = async (): Promise<void> => {
        await vscode.commands.executeCommand("editorScroll", {
            to: "up",
            by: "halfPage",
            revealCursor: true,
        });
        if (vscode.window.activeTextEditor) {
            await this.updateCursorPositionInNeovim(vscode.window.activeTextEditor);
        }
    };

    private onHalfScrollDownCommand = async (): Promise<void> => {
        await vscode.commands.executeCommand("editorScroll", {
            to: "down",
            by: "halfPage",
            revealCursor: true,
        });
        if (vscode.window.activeTextEditor) {
            await this.updateCursorPositionInNeovim(vscode.window.activeTextEditor);
        }
    };

    private onScrollUpCommand = async (): Promise<void> => {
        await vscode.commands.executeCommand("editorScroll", {
            to: "up",
            by: "page",
            revealCursor: true,
        });
        if (vscode.window.activeTextEditor) {
            await this.updateCursorPositionInNeovim(vscode.window.activeTextEditor);
        }
    };

    private onScrollDownCommand = async (): Promise<void> => {
        await vscode.commands.executeCommand("editorScroll", {
            to: "down",
            by: "page",
            revealCursor: true,
        });
        if (vscode.window.activeTextEditor) {
            await this.updateCursorPositionInNeovim(vscode.window.activeTextEditor);
        }
    };

    private onCtrlR = async (): Promise<void> => {
        await this.client.input("<C-r>");
    };

    private onCtrlV = async (): Promise<void> => {
        await this.client.input("<C-v>");
    };
}
