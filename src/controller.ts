import { spawn, ChildProcess } from "child_process";
import path from "path";

import vscode from "vscode";
import throttle from "lodash/throttle";
import { attach, Buffer as NeovimBuffer, NeovimClient } from "neovim";
import { VimValue } from "neovim/lib/types/VimValue";

import { CommandLineController } from "./command_line";
import { StatusLineController } from "./status_line";
import { HighlightProvider } from "./highlight_provider";

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

interface VSCodeLineChange {
    line: number;
    line2?: number;
    mode: "changed" | "newlinebefore" | "newlineafter" | "newlinemiddle" | "deletedline" | "multilinereplace";
}

interface RequestResponse {
    send(resp: unknown, isError?: boolean): void;
}

export class NVIMPluginController implements vscode.Disposable {
    private isInsertMode = false;

    private nvimProc: ChildProcess;
    private client: NeovimClient;

    private disposables: vscode.Disposable[] = [];
    private typeHandlerDisplose?: vscode.Disposable;

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
     * Vscode doesn't allow to apply multiple edits to the save document without awaiting previous reuslt.
     * So we'll accumulate neovim buffer updates here, then apply
     */
    private pendingBufChanges: Array<{
        buffer: NeovimBuffer;
        firstLine: number;
        lastLine: number;
        data: string[];
        tick: number;
    }> = [];

    /**
     * Simple command line UI
     */
    private commandLine: CommandLineController;

    /**
     * Status var UI
     */
    private statusLine: StatusLineController;

    /**
     * Maps highlight id to highlight group name
     */
    private highlightIdToGroupName: Map<number, string> = new Map();
    /**
     * HL group name to text decorator
     * Not all HL groups are supported now
     */
    private highlighGroupToDecorator: Map<string, vscode.TextEditorDecorationType> = new Map();

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

    private documentHighlightProvider = new HighlightProvider();

    private nvimAttachWaiter: Promise<void> = Promise.resolve();
    private isInit = false;

    private nvimRealLinePosition = 0;
    private nvimRealColPosition = 0;

    private bufQueuePromise?: Promise<void>;
    private resolveQueuePromise?: () => void;

    private neovimExtensionsPath: string;

    public constructor(neovimPath: string, extensionPath: string) {
        if (!neovimPath) {
            throw new Error("Neovim path is not defined");
        }
        this.neovimExtensionsPath = path.join(extensionPath, "vim", "*.vim");
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand));
        this.disposables.push(vscode.workspace.onDidOpenTextDocument(this.onOpenTextDocument));
        this.disposables.push(vscode.workspace.onDidCloseTextDocument(this.onCloseTextDocument));
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument));
        this.disposables.push(vscode.window.onDidChangeVisibleTextEditors(this.onChangedEdtiors));
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(this.onChangedActiveEditor));
        this.typeHandlerDisplose = vscode.commands.registerTextEditorCommand("type", this.onType);
        this.disposables.push(vscode.window.onDidChangeTextEditorSelection(this.onChangeSelection));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.cmdCompletion", this.onCmdCompletion));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.scrollUp", this.onScrollUpCommand));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.scrollDown", this.onScrollDownCommand));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.scrollHalfUp", this.onHalfScollUpCommand));
        this.disposables.push(
            vscode.commands.registerCommand("vscode-neovim.scrollHalfDown", this.onHalfScrollDownCommand),
        );
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.redo", this.onRedoCommand));

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
        this.client.on("notification", this.onNeoVimGlobalNotifcation);
        this.client.on("request", this.handleCustomRequest);
        this.commandLine = new CommandLineController();
        this.statusLine = new StatusLineController();
        this.commandLine.onAccept = this.onCmdAccept;
        this.commandLine.onChanged = this.onCmdChange;
        this.commandLine.onCanceled = this.onCmdCancel;
        this.commandLine.onBacksapce = this.onCmdBackspace;
        this.disposables.push(this.commandLine);
        this.disposables.push(this.statusLine);
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

        this.nvimAttachWaiter = this.client.uiAttach(9999, 100, {
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

            const requests: VimValue[] = [];
            requests.push(["nvim_buf_set_name", [buf, uri]]);
            requests.push(["nvim_buf_set_lines", [buf, 0, 1, false, lines]]);
            requests.push(["nvim_win_set_buf", [0, buf]]);
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
        const requests: VimValue[] = [];
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
        this.documentLines.set(uri, e.document.lineCount);
        const tick = await buf.changedtick;
        this.skipBufferTickUpdate.set(buf.id, tick + newRanges.length);
        await this.client.callAtomic(requests);
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
            await this.setCursorPositionInNeovim(e);
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

        await this.setCursorPositionInNeovim(e.textEditor);
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
        this.pendingBufChanges.push({ buffer, firstLine, lastLine, data: linedata, tick });
        if (this.resolveQueuePromise) {
            this.resolveQueuePromise();
        }
    };

    private watchAndApplyNeovimEdits = async (): Promise<void> => {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            // unfortunately workspace edit also doens't work for multiple text edit
            // const workspaceEdit = new vscode.WorkspaceEdit();
            const edit = this.pendingBufChanges.shift();
            if (!edit) {
                // wait 100ms for next tick. can be resolved earlier by notifying from onNeovimBufferEvent()
                let timeout: NodeJS.Timeout | undefined;
                this.bufQueuePromise = new Promise(res => {
                    this.resolveQueuePromise = res;
                    timeout = setTimeout(res, 100);
                });
                if (timeout) {
                    clearTimeout(timeout);
                }
                await this.bufQueuePromise;
                this.bufQueuePromise = undefined;
                this.resolveQueuePromise = undefined;
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
                        builder.replace(new vscode.Range(firstLine, 0, endRangeLine, endRangePos), "\n");
                    } else if (firstLine !== lastLine && (!data.length || (data.length === 1 && data[0] === ""))) {
                        builder.replace(new vscode.Range(firstLine, 0, endRangeLine, endRangePos), "");
                    } else {
                        // FIXME: creates new empty line here if editing last line
                        builder.replace(
                            new vscode.Range(firstLine, 0, endRangeLine, endRangePos),
                            data.map((d: string) => d + "\n").join(""),
                        );
                    }
                });
                this.documentLines.set(uri, textEditor.document.lineCount);
            }
        }
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

    private onType = (_editor: vscode.TextEditor, edit: vscode.TextEditorEdit, type: { text: string }): void => {
        if (!this.isInit) {
            return;
        }
        if (!this.isInsertMode) {
            this.client.input(type.text);
        } else {
            vscode.commands.executeCommand("default:type", { text: type.text });
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private onNeoVimGlobalNotifcation = (method: string, events: [string, ...any[]]): void => {
        if (method !== "redraw") {
            return;
        }
        let updateCursor = false;
        let updateHighlights = false;
        const currentScreenHighlights: { [key: string]: { [key: string]: string | "remove" } } = {};
        for (const [name, ...args] of events) {
            const firstArg = args[0] || [];
            switch (name) {
                case "mode_change": {
                    updateCursor = true;
                    this.handleModeChange(firstArg[0]);
                    break;
                }
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
                // Note on A and similar keys:
                // vim sends first mode change, then grid_cursor_goto in next notification
                case "grid_cursor_goto": {
                    // lastGotoCursorArgsWinBased = [firstArg[1], firstArg[2]];
                    if (!this.isInsertMode) {
                        updateCursor = true;
                    }
                    break;
                }
                case "cursor_goto": {
                    // lastGotoCursorArgsWinBased = firstArg;
                    if (!this.isInsertMode) {
                        updateCursor = true;
                    }
                    break;
                }
                case "flush": {
                    this.flushUpdate(updateCursor, updateHighlights, currentScreenHighlights);
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
                case "hl_attr_define": {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const [id, uiAttrs, termAttrs, info] = firstArg as [
                        number,
                        never,
                        never,
                        [{ kind: "ui"; ui_name: string; hi_name: string }],
                    ];
                    if (info && info[0] && info[0].hi_name) {
                        const name = info[0].hi_name;
                        const decorator = this.createDecorationForHighlightGroup(name);
                        if (decorator) {
                            this.highlighGroupToDecorator.set(name, decorator);
                            this.highlightIdToGroupName.set(id, name);
                        }
                    }
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

                        updateHighlights = true;
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
                                const highlightGroup = this.highlightIdToGroupName.get(cellHlId);
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
                case "msg_showcmd": {
                    const [content] = firstArg;
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
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const [ui, content, replaceLast] = firstArg;
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
                    const [content] = firstArg;
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
                default: {
                    // console.log(name);
                    // console.log(args);
                    break;
                }
            }
        }
    };

    private async flushUpdate(
        updateCursor: boolean,
        updateHighlights: boolean,
        highlights: { [key: string]: { [key: string]: string } | "remove" } = {},
    ): Promise<void> {
        if (updateCursor && vscode.window.activeTextEditor) {
            const [line1based, col0based] = await this.client.call("nvim_win_get_cursor", [0]);
            this.nvimRealLinePosition = line1based - 1;
            this.nvimRealColPosition = col0based;
            await this.updateCursorPosInActiveEditor(vscode.window.activeTextEditor);
        }
        if (updateHighlights) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            // calculate top visitor buffer line. highlight updates are in screen row:col coordinates, but we need to convert them to line based
            const screenRowPos1based = await this.client.callFunction("screenrow");
            const topVisibleBufferLine = this.nvimRealLinePosition - (screenRowPos1based - 1);
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
            for (const [lineId, updates] of Object.entries(highlights)) {
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
    }

    private applyHighlightsToDocument = throttle((document: vscode.TextDocument) => {
        const allUriEditors = vscode.window.visibleTextEditors.filter(
            e => e.document.uri.toString() === document.uri.toString(),
        );
        for (const [, groupName] of this.highlightIdToGroupName) {
            const ranges = this.documentHighlightProvider.provideDocumentHighlights(document, groupName);
            const decorator = this.highlighGroupToDecorator.get(groupName);
            if (!decorator) {
                continue;
            }
            for (const editor of allUriEditors) {
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
            this.typeHandlerDisplose = vscode.commands.registerTextEditorCommand("type", this.onType);
        }
        this.currentModeName = modeName;
        if (!vscode.window.activeTextEditor) {
            return;
        }
        vscode.commands.executeCommand("setContext", "neovim.mode", modeName);
        this.applyCursorStyleToEditor(vscode.window.activeTextEditor, modeName);
    };

    private setCursorPositionInNeovim = async (editor: vscode.TextEditor): Promise<void> => {
        await this.client.call("nvim_win_set_cursor", [
            0,
            [editor.selection.active.line + 1, editor.selection.active.character],
        ]);
    };

    private updateCursorPosInActiveEditor = async (edtior: vscode.TextEditor): Promise<void> => {
        const visibleRange = edtior.visibleRanges[0];
        const line = this.nvimRealLinePosition;
        const col = this.nvimRealColPosition;
        const currentCursor = edtior.selections[0].active;
        if (currentCursor.line === line && currentCursor.character === col) {
            return;
        }
        edtior.selections = [new vscode.Selection(line, col, line, col)];
        if (line < visibleRange.start.line) {
            // vscode.commands.executeCommand("editorScroll", { to: "up", by: "line", value: visibleRange.start.line - line });
            await vscode.commands.executeCommand("revealLine", { lineNumber: line, at: "top" });
        } else if (line > visibleRange.end.line) {
            // vscode.commands.executeCommand("editorScroll", { to: "down", by: "line", value: line - visibleRange.end.line });
            await vscode.commands.executeCommand("revealLine", { lineNumber: line, at: "bottom" });
        }
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

    private createDecorationForHighlightGroup(groupName: string): vscode.TextEditorDecorationType | undefined {
        if (groupName === "Search") {
            return vscode.window.createTextEditorDecorationType({
                backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
                borderColor: new vscode.ThemeColor("editor.findMatchHighlightBorder"),
            });
        } else if (groupName === "IncSearch") {
            return vscode.window.createTextEditorDecorationType({
                backgroundColor: new vscode.ThemeColor("editor.findMatchBackground"),
                borderColor: new vscode.ThemeColor("editor.findMatchBorder"),
            });
        } else if (groupName === "Visual" || groupName === "VisualNOS") {
            return vscode.window.createTextEditorDecorationType({
                backgroundColor: new vscode.ThemeColor("editor.selectionBackground"),
            });
        }
    }

    private handleCustomRequest = async (
        eventName: string,
        eventArgs: [string, ...unknown[]],
        response: RequestResponse,
    ): Promise<void> => {
        if (eventName !== "vscode-neovim") {
            return;
        }
        const [vscodeCommand, ...commandArgs] = eventArgs;
        try {
            const res = await this.runVSCodeCommand(vscodeCommand, ...commandArgs);
            response.send(res, false);
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
        await this.client.input("<Esc>");
        if (vscode.window.activeTextEditor && this.isInsertMode) {
            // since we're not sending cursor updates in insert mode, update now
            await this.setCursorPositionInNeovim(vscode.window.activeTextEditor);
        }
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
            await this.setCursorPositionInNeovim(vscode.window.activeTextEditor);
        }
    };

    private onHalfScrollDownCommand = async (): Promise<void> => {
        await vscode.commands.executeCommand("editorScroll", {
            to: "down",
            by: "halfPage",
            revealCursor: true,
        });
        if (vscode.window.activeTextEditor) {
            await this.setCursorPositionInNeovim(vscode.window.activeTextEditor);
        }
    };

    private onScrollUpCommand = async (): Promise<void> => {
        await vscode.commands.executeCommand("editorScroll", {
            to: "up",
            by: "page",
            revealCursor: true,
        });
        if (vscode.window.activeTextEditor) {
            await this.setCursorPositionInNeovim(vscode.window.activeTextEditor);
        }
    };

    private onScrollDownCommand = async (): Promise<void> => {
        await vscode.commands.executeCommand("editorScroll", {
            to: "down",
            by: "page",
            revealCursor: true,
        });
        if (vscode.window.activeTextEditor) {
            await this.setCursorPositionInNeovim(vscode.window.activeTextEditor);
        }
    };

    private onRedoCommand = async (): Promise<void> => {
        await this.client.input("<C-r>");
    };
}
