import * as vscode from "vscode";
import { spawn, ChildProcess } from "child_process";
import throttle from "lodash/throttle";
import { attach, Buffer as NeovimBuffer, NeovimClient } from "neovim";
import { CommandLineController } from "./command_line";
import { StatusLineController } from "./status_line";

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

export class NVIMPluginController implements vscode.Disposable {
    public isInsertMode: boolean = false;

    private nvimProc: ChildProcess;
    private client: NeovimClient;

    private disposables: vscode.Disposable[] = [];

    /**
     * Vscode uri string -> buffer mapping
     */
    private uriToBuffer: Map<string, NeovimBuffer> = new Map();
    /**
     * Buffer id -> vscode uri mapping
     */
    private bufferIdToUri: Map<number, string> = new Map();

    /**
     * All changes in simplified form done in insert mode
     */
    private uriChanges: Map<string, VSCodeLineChange[]> = new Map();

    /**
     * Track last changed version. Used to skip neovim update when in insert mode
     */
    private documentLastChangedVersion: Map<string, number> = new Map();

    /**
     * Vscode doesn't allow to apply multiple edits to the save document without awaiting previous reuslt.
     * So we'll accumulate neovim buffer updates here, then apply
     */
    private pendingBufChanges: Array<{ buffer: NeovimBuffer, firstLine: number, lastLine: number; data: string[] }> = [];

    /**
     * Simple command line UI
     */
    private commandLine: CommandLineController;

    /**
     * Status var UI
     */
    private statusLine: StatusLineController;

    /**
     * Neovim HL group to text decorator
     * Not all HL groups are supported now
     */
    private highlightIdToDecorator: Map<number, vscode.TextEditorDecorationType> = new Map();
    /**
     * HL group name to text decorator
     * Not all HL groups are supported now
     */
    // private highlighGroupToDecorator: Map<string, vscode.TextEditorDecorationType> = new Map();

    /**
     * Track current decoration type at line:col position for specific editor
     */
    private lineColDecoration: Map<vscode.TextEditor, Map<string, vscode.TextEditorDecorationType>> = new Map();
    /**
     * Tracks all range for a decorator for specific editor
     */
    private decoratorToRange: Map<vscode.TextEditor, Map<vscode.TextEditorDecorationType, vscode.Range[]>> = new Map();

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
    private currentModeName: string = "";

    // private backgroundToGroupName: Map<string, string> = new Map();

    public constructor() {
        this.nvimProc = spawn("C:\\Neovim\\bin\\nvim.exe", ["-u", "NONE", "-N", "--embed"], {});
        this.client = attach({ proc: this.nvimProc });
        this.client.on("notification", this.onNeoVimGlobalNotifcation);
        this.commandLine = new CommandLineController();
        this.statusLine = new StatusLineController();
        this.commandLine.onAccept = this.onCmdAccept;
        this.commandLine.onChanged = this.onCmdChange;
        this.commandLine.onCanceled = this.onCmdCancel;
        this.commandLine.onBacksapce = this.onCmdBackspace;
        this.disposables.push(this.commandLine);
        this.disposables.push(this.statusLine);
        // this.backgroundToGroupName.set("1", "Search");
        // this.backgroundToGroupName.set("2", "IncSearch");
        // this.backgroundToGroupName.set("3", "Visual");
    }

    public async init(): Promise<void> {
        await this.client.setClientInfo("vscode-neovim", { major: 0, minor: 1, patch: 0 }, "embedder", {}, {});
        await this.client.setOption("shortmess", "filnxtToOFI");
        await this.client.setOption("wildchar", 9);
        await this.client.uiAttach(160, 70, {
            rgb: true,
            // override: true,
            ext_cmdline: true,
            ext_linegrid: true,
            ext_hlstate: true,
            ext_messages: true,
            ext_multigrid: true,
            ext_termcolors: true,
            ext_popupmenu: true,
            ext_tabline: true,
            ext_wildmenu: true,
        } as any);
        // await this.client.command("hi Search guibg=#000001");
        // await this.client.command("hi IncSearch guibg=#000002");
        // await this.client.command("hi Visual guibg=#000003");

        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.escape", this.handleEscapeKey));
        this.disposables.push(vscode.workspace.onDidOpenTextDocument(this.onOpenTextDocument));
        this.disposables.push(vscode.workspace.onDidCloseTextDocument(this.onCloseTextDocument));
        this.disposables.push(vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument));
        this.disposables.push(vscode.window.onDidChangeVisibleTextEditors(this.onChangedEdtiors))
        this.disposables.push(vscode.window.onDidChangeActiveTextEditor(this.onChangedActiveEditor));
        this.disposables.push(vscode.commands.registerTextEditorCommand("type", this.onType));
        this.disposables.push(vscode.commands.registerCommand("vscode-neovim.cmdCompletion", this.onCmdCompletion));
    }

    public dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.client.quit();
    }

    private onOpenTextDocument = async (e: vscode.TextDocument): Promise<void> => {
        const uri = e.uri.toString();
        const buf = await this.client.createBuffer(true, true);
        if (typeof buf === "number") {
            // 0 is error
        } else {
            buf.name = uri;
            // this.decoratorToRange.set(uri, new Map());
            // this.lineColDecoration.set(uri, new Map());
            this.bufferIdToUri.set(buf.id, uri);
            this.uriToBuffer.set(uri, buf);
            this.uriChanges.set(uri, []);
            // incorrect definition
            this.client.buffer = buf as any;
            // set initial buffer text
            const eol = e.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
            const lines = e.getText().split(eol);
            await buf.replace(lines, 0);

            this.client.buffer.listen("lines", this.onNeovimBufferEvent);
        }
    }

    private onNeovimBufferEvent = (buffer: NeovimBuffer, tick: number, firstLine: number, lastLine: number, linedata: string[], more: boolean): void => {
        if (this.isInsertMode) {
            return;
        }
        // vscode disallow to do multiple edits without awaiting textEditor.edit result
        // so we'll process all changes in slightly throttled function
        this.pendingBufChanges.push({ buffer, firstLine, lastLine, data: linedata });
        this.applyPendingNeoVimEdits();
    }

    private applyPendingNeoVimEdits = throttle(async () => {
        const edits = [...this.pendingBufChanges];
        this.pendingBufChanges = [];

        // unfortunately workspace edit also doens't work for multiple text edit
        // const workspaceEdit = new vscode.WorkspaceEdit();

        for (const { buffer, data, firstLine, lastLine } of edits) {
            const uri = this.bufferIdToUri.get(buffer.id);
            if (!uri) {
                continue;
            }
            const textEditor = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri);
            if (!textEditor) {
                continue;
            }
            this.documentLastChangedVersion.set(uri, textEditor.document.version + 1);
            let endRangeLine = lastLine;
            let endRangePos = 0;
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
                    builder.replace(new vscode.Range(firstLine, 0, endRangeLine, endRangePos), data.map((d: string) => d + "\n").join(""))
                }
            });
            this.documentLines.set(uri, textEditor.document.lineCount);
        }
    }, 20);

    private onCloseTextDocument = (e: vscode.TextDocument): void => {
        const uri = e.uri.toString();
        const buf = this.uriToBuffer.get(uri);
        if (buf) {
            buf.unlisten("lines", this.onNeovimBufferEvent);
            this.client.command(`bd${buf.id}`);
            this.bufferIdToUri.delete(buf.id);
        }
        this.uriToBuffer.delete(uri);
        this.uriChanges.delete(uri);
        this.documentLastChangedVersion.delete(uri);
        this.documentLines.delete(uri);
        // this.decoratorToRange.delete(uri);
        // this.lineColDecoration.delete(uri);
    }

    private onChangeTextDocument = (e: vscode.TextDocumentChangeEvent): void => {
        const uri = e.document.uri.toString();
        const version = e.document.version;
        if (this.documentLastChangedVersion.get(uri) === version) {
            return;
        }
        if (this.isInsertMode) {
            const eol = e.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
            // if (!this.uriChanges.has(uri)) {
            //     this.uriChanges.set(uri, new Set());
            // }
            // const changedLines = this.uriChanges.get(uri)!;
            const uriChanges = this.uriChanges.get(uri)!;
            for (const change of e.contentChanges) {
                const { range, rangeLength, rangeOffset, text } = change;
                // if true when it's ordinary text change or newline insert
                if (change.range.isSingleLine) {
                    const { line, character } = range.start;
                    if (text === "\n" || text === "\r\n") {
                        uriChanges.push({
                            line, mode: character === 0
                                ? "newlinebefore"
                                : character === e.document.lineAt(line).rangeIncludingLineBreak.start.character
                                    ? "newlineafter"
                                    : "newlinemiddle"
                        });
                    } else {
                        const changedTextByLine = text.split(eol);
                        const lastChange = uriChanges[uriChanges.length - 1];
                        if (!lastChange || lastChange.line !== line || lastChange.mode !== "changed") {
                            uriChanges.push({ line, mode: "changed" });
                        }
                        // inserted snippet
                        if (changedTextByLine.length > 1) {
                            uriChanges.push({ line, mode: "newlineafter" });
                            for (let i = 1; i < changedTextByLine.length; i++) {
                                uriChanges.push({ line: line + i, mode: "changed" });
                                if (i + 1 < changedTextByLine.length) {
                                    uriChanges.push({ line: line + i, mode: "newlineafter" });
                                }
                            }
                        }
                    }
                } else {
                    // deleted line/newline
                    if (text === "") {
                        uriChanges.push({ mode: "deletedline", line: change.range.start.line, line2: change.range.end.line });
                    } else {
                        const currentLineCount = e.document.lineCount;
                        const prevLineCount = this.documentLines.get(uri) || 0;
                        // deleted some lines while replacing
                        if (currentLineCount < prevLineCount) {
                            uriChanges.push({ mode: "deletedline", line: change.range.end.line, line2: change.range.end.line + (prevLineCount - currentLineCount) });
                        }
                        // replaced some text within multineline
                        uriChanges.push({ mode: "multilinereplace", line: change.range.start.line, line2: change.range.end.line });
                    }
                }
            }
            this.documentLines.set(uri, e.document.lineCount);
        }
    }

    private onChangedEdtiors = (e: vscode.TextEditor[]): void => {
        for (const editor of e) {
            this.applyCursorToEditor(editor, this.currentModeName);
            if (!this.lineColDecoration.has(editor)) {
                this.lineColDecoration.set(editor, new Map());
            }
            if (!this.decoratorToRange.has(editor)) {
                this.decoratorToRange.set(editor, new Map());
            }
        }
        // remove closed editors from mappings
        for (const [editor] of this.lineColDecoration) {
            if (!e.find(visibleEditor => visibleEditor === editor)) {
                this.lineColDecoration.delete(editor);
                this.decoratorToRange.delete(editor);
            }
        }
    }

    private onChangedActiveEditor = (e: vscode.TextEditor | undefined): void => {
        const buf = e ? this.uriToBuffer.get(e.document.uri.toString()) : undefined;
        if (buf) {
            this.client.buffer = buf as any;
        }
    }


    private onType = (_editor: vscode.TextEditor, edit: vscode.TextEditorEdit, type: { text: string }): void => {
        if (!this.isInsertMode) {
            this.client.input(type.text);
        } else {
            vscode.commands.executeCommand("default:type", { text: type.text });
        }
    }

    private onNeoVimGlobalNotifcation = (method: string, events: [string, ...any[]]) => {
        if (method !== "redraw") {
            console.log(`Unhandled method: ${method}`);
            return;
        }
        let lastGotoCursorArgs: [number, number] | undefined;
        let cellHlId: number = 0;
        for (const [name, args] of events) {
            switch (name) {
                case "mode_change": {
                    this.handleModeChange(args[0], args[1]);
                    break;
                }
                case "mode_info_set": {
                    const [, modes] = args as [string, any[]];
                    for (const mode of modes) {
                        if (!mode.name) {
                            continue;
                        }
                        this.vimModes.set(mode.name, "cursor_shape" in mode ? {
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
                        } : {
                                name: mode.name,
                                shortName: mode.short_name,
                                mouseShape: mode.mouse_shape,
                            }
                        );
                    }
                    break;
                }
                case "grid_cursor_goto": {
                    lastGotoCursorArgs = [args[1], args[2]];
                    break;
                }
                case "cursor_goto": {
                    lastGotoCursorArgs = args;
                    break;
                }
                case "flush": {
                    // set new cursor position from last obtained cursor position
                    if (lastGotoCursorArgs) {
                        this.updateCursor(...lastGotoCursorArgs);
                    }
                    break;
                }
                case "cmdline_show": {
                    const [content, pos, firstc, prompt, indent, level] = args as [[object, string][], number, string, string, number, number];
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
                    const [line] = args as [string];
                    this.commandLine.append(line);
                    break;
                }
                // case "update_fg":
                // case "update_bg":
                // case "update_sp": {
                //     // console.log(name);
                //     // console.log(args);
                //     break;
                // }
                // case "hl_group_set": {
                //     const [name, id] = args;
                //     // console.log(name);
                //     break;
                // }
                // case "highlight_set": {
                //     const [attrs] = args as [HighlightSetAttributes];
                //     decoratorForNextText = undefined;
                //     if (attrs.background) {
                //         const color = attrs.background.toString(16);
                //         console.log(color);
                //         const group = this.backgroundToGroupName.get(color);
                //         if (group) {
                //             if (!this.highlighGroupToDecorator.has(color)) {
                //                 const decorator = this.createDecorationForHighlightGroup(group);
                //                 if (decorator) {
                //                     this.highlighGroupToDecorator.set(color, decorator);
                //                     decoratorForNextText = decorator;
                //                 }
                //             } else {
                //                 const decorator = this.highlighGroupToDecorator.get(color)!;
                //                 decoratorForNextText = decorator;
                //             }
                //         }
                //     }
                //     break;
                // }
                // case "put": {
                //     if (!lastGotoCursorArgs) {
                //         break;
                //     }
                //     const [line, col] = lastGotoCursorArgs;
                //     const editor = vscode.window.activeTextEditor;
                //     if (!editor) {
                //         break;
                //     }

                //     const uri = editor.document.uri.toString();
                //     const allUriEditors = vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === uri);
                //     for (const editor of allUriEditors) {
                //         if (decoratorForNextText) {
                //             console.log(`Putting decorator for: ${line}:${col}`);
                //             this.removeDecoratorFromLineColumn(editor, line, col);
                //             this.addDecoratorForLineColumn(editor, line, col, decoratorForNextText);
                //         } else {
                //             console.log(`Removing decorator for: ${line}:${col}`);
                //             console.log(args);
                //             this.removeDecoratorFromLineColumn(editor, line, col);
                //         }
                //     }
                //     break;
                // }
                case "hl_attr_define": {
                    const [id, uiAttrs, termAttrs, info] = args as [number, never, never, [{ kind: "ui", ui_name: string, hi_name: string }]];
                    if (info && info[0] && info[0].hi_name) {
                        const decor = this.createDecorationForHighlightGroup(info[0].ui_name);
                        if (decor) {
                            console.log(`created for: ${info[0].ui_name} - id: ${id}`);
                            this.highlightIdToDecorator.set(id, decor);
                        }
                    }
                    break;
                }
                case "grid_line": {
                    const [grid, row, colStart, cells] = args as [number, number, number, [string, number?, number?][]];
                    let cellIdx = 0;
                    if (row >= 69) {
                        break;
                    }
                    console.log(`Grid line: ${row}:${colStart}-${cells.length}`);

                    const editor = vscode.window.activeTextEditor;
                    if (!editor) {
                        break;
                    }
                    const uri = editor.document.uri.toString();
                    const allUriEditors = vscode.window.visibleTextEditors.filter(e => e.document.uri.toString() === uri);
                    for (const [text, hlId, repeat] of cells) {
                        if (hlId) {
                            cellHlId = hlId;
                            console.log(hlId);
                        }
                        for (let i = 0; i < (repeat || 1); i++) {
                            const col = colStart + cellIdx;
                            if (this.highlightIdToDecorator.has(cellHlId)) {
                                console.log(`Applying ${cellHlId} to: ${row}:${col} - ${text}, repeat: ${repeat}`);
                                for (const editor of allUriEditors) {
                                    this.removeDecoratorFromLineColumn(editor, row, col);
                                    this.addDecoratorForLineColumn(editor, row, col, this.highlightIdToDecorator.get(cellHlId)!);
                                }
                            } else {
                                console.log(`Removing: ${row}:${col} - ${text}, repeat: ${repeat}`);
                                for (const editor of allUriEditors) {
                                    this.removeDecoratorFromLineColumn(editor, row, col);
                                }
                            }
                            cellIdx++;
                        }
                    }
                    break;
                }
                case "msg_showcmd": {
                    const [content] = args;
                    let str = "";
                    if (content) {
                        for (const c of content) {
                            const [hlId, cmdStr] = c;
                            if (cmdStr) {
                                str += cmdStr;
                            }
                        }
                    }
                    this.statusLine.statusString = str;
                    break;
                }
                case "msg_show": {
                    const [ui, content, replaceLast] = args;
                    // if (ui === "confirm" || ui === "confirmsub" || ui === "return_prompt") {
                    //     this.nextInputBlocking = true;
                    // }
                    let str = "";
                    if (content) {
                        for (const c of content) {
                            const [hlId, cmdStr] = c;
                            if (cmdStr) {
                                str += cmdStr;
                            }
                        }
                    }
                    this.statusLine.msgString = str;
                    break;
                }
                case "msg_showmode": {
                    const [content] = args;
                    let str = "";
                    if (content) {
                        for (const c of content) {
                            const [hlId, modeStr] = c;
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
    }

    private handleEscapeKey = async () => {
        if (this.isInsertMode) {
            if (vscode.window.activeTextEditor) {
                const uri = vscode.window.activeTextEditor.document.uri.toString();
                const buf = this.uriToBuffer.get(uri);
                const changes = this.uriChanges.get(uri)!;
                if (changes.length && buf) {
                    const requests: any[] = [];
                    for (const { mode, line, line2 } of changes) {
                        try {
                            if (mode === "changed") {
                                const text = vscode.window.activeTextEditor.document.lineAt(line).text;
                                requests.push(["nvim_buf_set_lines", [buf, line, line + 1, false, [text]]]);
                            } else if (mode === "newlineafter") {
                                const text = vscode.window.activeTextEditor.document.lineAt(line).text;
                                requests.push(["nvim_buf_set_lines", [buf, line, line + 1, false, [text, ""]]]);
                            } else if (mode === "newlinebefore") {
                                const text = vscode.window.activeTextEditor.document.lineAt(line + 1).text;
                                requests.push(["nvim_buf_set_lines", [buf, line, line + 1, false, ["", text]]]);
                            } else if (mode === "newlinemiddle") {
                                const text1 = vscode.window.activeTextEditor.document.lineAt(line).text;
                                const text2 = vscode.window.activeTextEditor.document.lineAt(line + 1).text;
                                requests.push(["nvim_buf_set_lines", [buf, line, line + 1, false, [text1, text2]]]);
                            } else if (mode === "deletedline" && line2) {
                                const text = vscode.window.activeTextEditor.document.lineAt(line).text;
                                requests.push(["nvim_buf_set_lines", [buf, line, line2 + 1, false, [text]]]);
                            } else if (mode === "multilinereplace" && line2) {
                                const lines: string[] = [];
                                for (let i = line; i <= line2; i++) {
                                    const text = vscode.window.activeTextEditor.document.lineAt(i).text;
                                    lines.push(text);
                                }
                                requests.push(["nvim_buf_set_lines", [buf, line, line2 + 1, false, lines]]);
                            }
                        } catch {
                            // ignore
                        }
                    }
                    const editor = vscode.window.activeTextEditor;
                    const currentEditorLine = editor.selection.active.line;
                    const currentEditorCharacter = editor.selection.active.character;
                    requests.push(["nvim_win_set_cursor", [0, [currentEditorLine + 1, currentEditorCharacter]]]);
                    await this.client.request("nvim_call_atomic", [requests]);
                    const buf2 = await this.client.buffer;
                    const lines = await buf2.lines;
                    console.log("Lines after change: " + JSON.stringify(lines));
                    this.uriChanges.set(uri, []);
                }
            }
        }
        this.client.input("<Esc>");
    };

    private handleModeChange = (modeName: string, id: number) => {
        this.isInsertMode = modeName === "insert";
        this.currentModeName = modeName;
        if (!vscode.window.activeTextEditor) {
            return;
        }
        // apply cursor style
        this.applyCursorToEditor(vscode.window.activeTextEditor, modeName);
    }

    private updateCursor = (row: number, col: number) => {
        if (!vscode.window.activeTextEditor) {
            return;
        }
        vscode.window.activeTextEditor.selections = [new vscode.Selection(row, col, row, col)];
    }

    private applyCursorToEditor(editor: vscode.TextEditor, modeName: string): void {
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

    private removeDecoratorFromLineColumn(editor: vscode.TextEditor, line: number, column: number, all = false): void {
        const editorDecoratorMap = this.lineColDecoration.get(editor);
        const editorDecoratorRangeMap = this.decoratorToRange.get(editor);
        if (!editorDecoratorMap || !editorDecoratorRangeMap) {
            return;
        }
        const decorator = editorDecoratorMap.get(`${line}-${column}`);
        if (!decorator) {
            return;
        }
        const currentRange = editorDecoratorRangeMap.get(decorator) || [];
        if (!all) {
            const newRange = currentRange.filter(r => !(r.start.line === line && r.start.character === column && r.end.line === line && r.end.character === column + 1));
            editorDecoratorRangeMap.set(decorator, newRange);
            editorDecoratorMap.delete(`${line}-${column}`);
            editor.setDecorations(decorator, newRange);
        } else {
            for (const range of currentRange) {
                editorDecoratorMap.delete(`${range.start.line}-${range.start.character}`);
                editorDecoratorRangeMap.set(decorator, []);
            }
            editor.setDecorations(decorator, []);
            editorDecoratorRangeMap.set(decorator, []);
        }
        // editorDecoratorRangeMap.set(decorator, newRange);
        // editorDecoratorMap.delete(`${line}-${column}`);
    }

    private addDecoratorForLineColumn(editor: vscode.TextEditor, line: number, column: number, decorator: vscode.TextEditorDecorationType): void {
        const editorDecoratorMap = this.lineColDecoration.get(editor);
        const editorDecoratorRangeMap = this.decoratorToRange.get(editor);
        if (!editorDecoratorMap || !editorDecoratorRangeMap) {
            return;
        }

        editorDecoratorMap.set(`${line}-${column}`, decorator);
        const currentRange = editorDecoratorRangeMap.get(decorator) || [];
        currentRange.push(new vscode.Range(line, column, line, column + 1));
        editor.setDecorations(decorator, currentRange);
        editorDecoratorRangeMap.set(decorator, currentRange);
    }

    private onCmdChange = async (e: string) => {
        await this.client.input(e.slice(-1));
    }

    private onCmdBackspace = async () => {
        await this.client.input("<BS>");
    }

    private onCmdCancel = async () => {
        vscode.commands.executeCommand("setContext", "vim.cmdLine", false);
        await this.client.input("<Esc>");
    }

    private onCmdAccept = async () => {
        await this.client.input("<CR>");
    }

    private onCmdCompletion = async () => {
        await this.client.input("<Tab>");
    }
}