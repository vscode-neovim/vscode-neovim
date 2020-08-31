import { spawn, ChildProcess } from "child_process";
import path from "path";

import vscode from "vscode";
import { attach, Buffer as NeovimBuffer, NeovimClient, Window } from "neovim";
import { ATTACH } from "neovim/lib/api/Buffer";
// eslint-disable-next-line import/no-extraneous-dependencies
import { createLogger, transports as loggerTransports } from "winston";
import { set } from "lodash";

import * as Utils from "./utils";
import { CommandLineController } from "./command_line";
import { StatusLineController } from "./status_line";
import { HighlightProvider, HighlightConfiguration } from "./highlight_provider";
import { CommandsController } from "./commands_controller";
import { ModeManager } from "./mode_manager";
import { BufferManager } from "./buffer_manager";
import { TypingManager } from "./typing_manager";
import { CursorManager } from "./cursor_manager";
import { Logger, LogLevel } from "./logger";
import { DocumentChangeManager } from "./document_change_manager";
import {
    NeovimCommandProcessable,
    NeovimExtensionRequestProcessable,
    NeovimRangeCommandProcessable,
    NeovimRedrawProcessable,
} from "./neovim_events_processable";

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

// set numberwidth=8
const NUMBER_COLUMN_WIDTH = 8;

export interface ControllerSettings {
    neovimPath: string;
    extensionPath: string;
    highlightsConfiguration: HighlightConfiguration;
    mouseSelection: boolean;
    useWsl: boolean;
    customInitFile: string;
    neovimViewportWidth: number;
    neovimViewportHeight: number;
}

const LOG_PREFIX = "MainController";

export class MainController implements vscode.Disposable {
    // to not deal with screenrow positioning, we set height to high value and scrolloff to value / 2. so screenrow will be always constant
    // big scrolloff is needed to make sure that editor visible space will be always within virtual vim boundaries, regardless of current
    // cursor positioning
    private NEOVIM_WIN_HEIGHT = 201;
    private NEOVIM_WIN_WIDTH = 1000;
    private FIRST_SCREEN_LINE = 0;
    private LAST_SCREEN_LINE = 200;

    /**
     * Current vim mode
     */
    private currentModeName = "";
    private ignoreNextCursorUpdate = false;
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
     * Last subsequent related changes. Used for dot-repeat workaround
     */
    private lastChange?: Utils.DotRepeatChange;
    private exitingInsertModePendingKeys: string[] = [];
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

    private commandsController!: CommandsController;
    /**
     * Simple command line UI
     */
    private commandLine?: CommandLineController;
    /**
     * Status var UI
     */
    private statusLine!: StatusLineController;
    /**
     * Vim modes
     */
    private vimModes: Map<string, CursorMode | OtherMode> = new Map();
    private highlightProvider!: HighlightProvider;

    private nvimInitPromise: Promise<void> = Promise.resolve();
    private isInit = false;

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
     * !seems not needed anymore
     */
    // private editorPendingCursor: WeakMap<
    //     vscode.TextEditor,
    //     { line: number; col: number; screenRow: number; totalSkips: number }
    // > = new WeakMap();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private noEditorBuffer: NeovimBuffer = undefined as any;

    private editorColumnIdToWinId: Map<number, number> = new Map();

    private cmdlineTimer?: NodeJS.Timeout;

    private editorChangedPromise?: Promise<void>;

    private skipJumpsForUris: Map<string, boolean> = new Map();

    private grids: Map<number, Utils.GridConf> = new Map();

    private numberLineHlId = 0;

    /**
     * Cursor updates originated through neovim or neovim changes. Key is the "line.col"
     */
    private neovimCursorUpdates: WeakMap<vscode.TextEditor, { [key: string]: boolean }> = new WeakMap();

    /**
     * Special variable to hint dot repeat if the insert mode was started through o or O
     * Note: vscode doesn't tell if a change was originated through a command (such as insertLineBefore/After) or through a keystroke (e.g. Enter),
     * And we're using vscode version of o/O because of indent (VIM shouldn't know about syntax/indent), so need an internal state
     */
    private dotRepeatInsertModeStartHint?: "o" | "O";

    /**
     * Timestamp when the first composite escape key was pressed. Using timestamp because timer may be delayed if the extension host is busy
     */
    private compositeEscapeFirstPressTimestamp?: number;

    private settings: ControllerSettings;
    private modeManager!: ModeManager;
    private bufferManager!: BufferManager;
    private changeManager!: DocumentChangeManager;
    private typingManager!: TypingManager;
    private cursorManager!: CursorManager;
    private logger!: Logger;

    public constructor(settings: ControllerSettings) {
        this.settings = settings;
        this.NEOVIM_WIN_HEIGHT = settings.neovimViewportHeight;
        this.NEOVIM_WIN_WIDTH = settings.neovimViewportWidth;
        if (!settings.neovimPath) {
            throw new Error("Neovim path is not defined");
        }
        this.logger = new Logger(LogLevel.debug, "/tmp/test.txt", true);
        this.disposables.push(this.logger);
        // this.mouseSelectionEnabled = settings.mouseSelection;
        // this.highlightProvider = new HighlightProvider(settings.highlightsConfiguration);
        // this.disposables.push(vscode.commands.registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand));
        // this.disposables.push(vscode.workspace.onDidChangeTextDocument(this.onChangeTextDocument));
        // this.disposables.push(vscode.window.onDidChangeVisibleTextEditors(this.onChangedEdtiors));
        // this.disposables.push(vscode.window.onDidChangeActiveTextEditor(this.onChangedActiveEditor));
        // this.disposables.push(vscode.window.onDidChangeTextEditorSelection(this.onChangeSelection));
        // // this.disposables.push(vscode.window.onDidChangeTextEditorVisibleRanges(this.onChangeVisibleRange));
        // this.typeHandlerDisplose = vscode.commands.registerTextEditorCommand("type", this.onVSCodeType);

        // this.disposables.push(
        //     vscode.commands.registerCommand("vscode-neovim.compositeEscape1", (key: string) =>
        //         this.handleCompositeEscapeFirstKey(key),
        //     ),
        // );
        // this.disposables.push(
        //     vscode.commands.registerCommand("vscode-neovim.compositeEscape2", (key: string) =>
        //         this.handleCompositeEscapeSecondKey(key),
        //     ),
        // );

        const neovimSupportScriptPath = path.join(settings.extensionPath, "vim", "vscode-neovim.vim");
        const neovimOptionScriptPath = path.join(settings.extensionPath, "vim", "vscode-options.vim");

        const args = [
            "-N",
            "--embed",
            // load options after user config
            "-c",
            settings.useWsl ? `source $(wslpath '${neovimOptionScriptPath}')` : `source ${neovimOptionScriptPath}`,
            // load support script before user config (to allow to rebind keybindings/commands)
            "--cmd",
            settings.useWsl ? `source $(wslpath '${neovimSupportScriptPath}')` : `source ${neovimSupportScriptPath}`,
        ];
        if (settings.useWsl) {
            args.unshift(settings.neovimPath);
        }
        if (parseInt(process.env.NEOVIM_DEBUG || "", 10) === 1) {
            args.push(
                "-u",
                "NONE",
                "--listen",
                `${process.env.NEOVIM_DEBUG_HOST || "127.0.0.1"}:${process.env.NEOVIM_DEBUG_PORT || 4000}`,
            );
        }
        if (settings.customInitFile) {
            args.push("-u", settings.customInitFile);
        }
        this.logger.debug(
            `${LOG_PREFIX}: Spawning nvim, path: ${settings.neovimPath}, useWsl: ${
                settings.useWsl
            }, args: ${JSON.stringify(args)}`,
        );
        this.nvimProc = spawn(settings.useWsl ? "C:\\Windows\\system32\\wsl.exe" : settings.neovimPath, args, {});
        this.logger.debug(`${LOG_PREFIX}: Attaching to neovim`);
        this.client = attach({
            proc: this.nvimProc,
            options: {
                logger: createLogger({
                    transports: [new loggerTransports.Console()],
                    level: "error",
                    exitOnError: false,
                }),
            },
        });
        // this.disposables.push(this.statusLine);
        // this.disposables.push(this.commandsController);

        // this.client.on("notification", this.onNeovimNotification);
        // this.client.on("request", this.handleCustomRequest);
    }

    public async init(): Promise<void> {
        // let resolveInitPromise: () => void = () => {
        //     /* ignore */
        // };
        // this.nvimInitPromise = new Promise((res) => {
        //     resolveInitPromise = res;
        // });
        this.logger.debug(`${LOG_PREFIX}: Init`);
        await this.client.setClientInfo("vscode-neovim", { major: 0, minor: 1, patch: 0 }, "embedder", {}, {});
        await this.checkNeovimVersion();
        const channel = await this.client.channelId;
        await this.client.setVar("vscode_channel", channel);

        this.logger.debug(`${LOG_PREFIX}: UIAttach`);
        await this.client.uiAttach(this.NEOVIM_WIN_WIDTH, this.NEOVIM_WIN_HEIGHT, {
            rgb: true,
            // override: true,
            ext_cmdline: true,
            ext_linegrid: true,
            ext_hlstate: true,
            ext_messages: true,
            ext_multigrid: true,
            ext_popupmenu: true,
            ext_tabline: true,
            ext_wildmenu: true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        this.highlightProvider = new HighlightProvider(this.settings.highlightsConfiguration);
        this.statusLine = new StatusLineController();
        this.disposables.push(this.statusLine);

        this.commandsController = new CommandsController(this.client);
        this.disposables.push(this.commandsController);

        this.modeManager = new ModeManager(this.logger);
        this.disposables.push(this.modeManager);

        this.bufferManager = new BufferManager(this.logger, this.client, {
            neovimViewportHeight: 201,
            neovimViewportWidth: 1000,
        });
        this.disposables.push(this.bufferManager);

        this.changeManager = new DocumentChangeManager(this.logger, this.client, this.bufferManager, this.modeManager);
        this.disposables.push(this.changeManager);

        this.cursorManager = new CursorManager(
            this.logger,
            this.client,
            this.modeManager,
            this.bufferManager,
            this.changeManager,
            {
                mouseSelectionEnabled: false,
            },
        );
        this.disposables.push(this.cursorManager);

        this.typingManager = new TypingManager(this.logger, this.client, this.modeManager, this.changeManager);
        this.disposables.push(this.typingManager);

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

        this.logger.debug(`${LOG_PREFIX}: Attaching to neovim notifications`);
        this.client.on("notification", this.onNeovimNotification);
        this.client.on("request", this.handleCustomRequest);
        this.bufferManager.forceResync();

        // for (const e of vscode.window.visibleTextEditors) {
        //     await this.initBuffer(e);
        // }
        // this.onChangedEdtiors(vscode.window.visibleTextEditors);
        // await this.onChangedActiveEditor(vscode.window.activeTextEditor, true);
        await vscode.commands.executeCommand("setContext", "neovim.init", true);
        this.logger.debug(`${LOG_PREFIX}: Init completed`);
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        if (this.commandLine) {
            this.commandLine.dispose();
        }
        this.client.quit();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private onNeovimNotification = (method: string, events: [string, ...any[]]): void => {
        // order matters here, modeManager should be processed first
        const redrawManagers: NeovimRedrawProcessable[] = [this.modeManager, this.bufferManager, this.cursorManager];
        const extensionCommandManagers: NeovimExtensionRequestProcessable[] = [this.modeManager, this.changeManager];
        const vscodeComandManagers: NeovimCommandProcessable[] = [];
        const vscodeRangeCommandManagers: NeovimRangeCommandProcessable[] = [];

        if (method === "vscode-command") {
            const [vscodeCommand, commandArgs] = events as [string, unknown[]];
            vscodeComandManagers.forEach((m) =>
                m.handleVSCodeCommand(vscodeCommand, Array.isArray(commandArgs) ? commandArgs : [commandArgs]),
            );
            // this.handleVSCodeCommand(vscodeCommand, Array.isArray(commandArgs) ? commandArgs : [commandArgs]);
            return;
        }
        if (method === "vscode-range-command") {
            const [vscodeCommand, line1, line2, pos1, pos2, leaveSelection, args] = events;
            vscodeRangeCommandManagers.forEach((m) =>
                m.handleVSCodeRangeCommand(
                    vscodeCommand,
                    line1,
                    line2,
                    pos1,
                    pos2,
                    !!leaveSelection,
                    Array.isArray(args) ? args : [args],
                ),
            );
            // this.handleVSCodeRangeCommand(
            //     vscodeCommand,
            //     line1,
            //     line2,
            //     pos1,
            //     pos2,
            //     !!leaveSelection,
            //     Array.isArray(args) ? args : [args],
            // );
            return;
        }
        if (method === "vscode-neovim") {
            const [command, args] = events;
            extensionCommandManagers.forEach((m) => m.handleExtensionRequest(command, args));
            // this.handleExtensionRequest(command, args);
            return;
        }
        if (method !== "redraw") {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // const currRedrawNotifications: [string, ...any[]][] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const redrawEvents = events as [string, ...any[]][];
        const hasFlush = Utils.findLastEvent("flush", events);

        // let flush = false;
        // for (const [name, ...args] of events) {
        //     if (name === "flush") {
        //         flush = true;
        //     } else {
        //         currRedrawNotifications.push([name, ...args]);
        //     }
        // }
        if (hasFlush) {
            const batch = [...this.currentRedrawBatch.splice(0), ...redrawEvents];
            redrawManagers.forEach((m) => m.handleRedrawBatch(batch));
            // this.processRedrawBatch(batch);
        } else {
            this.currentRedrawBatch.push(...redrawEvents);
        }
    };

    private handleCustomRequest = async (
        eventName: string,
        eventArgs: [string, ...unknown[]],
        response: RequestResponse,
    ): Promise<void> => {
        const extensionCommandManagers: NeovimExtensionRequestProcessable[] = [this.modeManager, this.changeManager];
        const vscodeCommandManagers: NeovimCommandProcessable[] = [];
        const vscodeRangeCommandManagers: NeovimRangeCommandProcessable[] = [];
        try {
            let result: unknown;
            if (eventName === "vscode-command") {
                const [vscodeCommand, commandArgs] = eventArgs as [string, unknown[]];
                const results = await Promise.all(
                    vscodeCommandManagers.map((m) =>
                        m.handleVSCodeCommand(vscodeCommand, Array.isArray(commandArgs) ? commandArgs : [commandArgs]),
                    ),
                );
                // use first non nullable result
                result = results.find((r) => r != null);
            } else if (eventName === "vscode-range-command") {
                const [vscodeCommand, line1, line2, pos1, pos2, leaveSelection, commandArgs] = eventArgs as [
                    string,
                    number,
                    number,
                    number,
                    number,
                    number,
                    unknown[],
                ];
                const results = await Promise.all(
                    vscodeRangeCommandManagers.map((m) =>
                        m.handleVSCodeRangeCommand(
                            vscodeCommand,
                            line1,
                            line2,
                            pos1,
                            pos2,
                            !!leaveSelection,
                            Array.isArray(commandArgs) ? commandArgs : [commandArgs],
                        ),
                    ),
                );
                // use first non nullable result
                result = results.find((r) => r != null);
            } else if (eventName === "vscode-neovim") {
                const [command, commandArgs] = eventArgs as [string, unknown[]];
                const results = await Promise.all(
                    extensionCommandManagers.map((m) => m.handleExtensionRequest(command, commandArgs)),
                );
                // use first non nullable result
                result = results.find((r) => r != null);
            }
            response.send(result || "", false);
        } catch (e) {
            response.send(e.message, true);
        }
    };

    private processRedrawBatch = (batch: [string, ...unknown[]][]): void => {
        let newModeName: string | undefined;
        // since neovim sets cmdheight=0 internally various vim plugins like easymotion are working incorrect and awaiting hitting enter
        let acceptPrompt = false;
        const gridCursorUpdates: Set<number> = new Set();
        const gridHLUpdates: Set<number> = new Set();
        // must to setup win conf event first
        const winEvents = batch.filter(([name]) => name === "win_pos" || name === "win_external_pos");
        if (winEvents.length) {
            batch.unshift(...winEvents);
        }

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
                            if (name === "LineNr") {
                                this.numberLineHlId = id;
                            }
                        }
                    }
                    break;
                }
                case "cmdline_show": {
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const [content, pos, firstc, prompt, indent, level] = firstArg as [
                        // eslint-disable-next-line @typescript-eslint/ban-types
                        [object, string][],
                        number,
                        string,
                        string,
                        number,
                        number,
                    ];
                    const allContent = content.map(([, str]) => str).join("");
                    // !note: neovim can send cmdline_hide followed by cmdline_show events
                    // !since quickpick can be destroyed slightly at later time after handling cmdline_hide we want to create new command line
                    // !controller and input for every visible cmdline_show event
                    // !otherwise we may hit cmdline_show when it's being hidden
                    // as alternative, it's possible to process batch and determine if we need show/hide or just redraw the command_line
                    // but this won't handle the case when cmdline_show comes in next flush batch (is it possible?)
                    // btw, easier to just recreate whole command line (and quickpick inside)
                    if (this.cmdlineTimer) {
                        clearTimeout(this.cmdlineTimer);
                        this.cmdlineTimer = undefined;
                        if (!this.commandLine) {
                            this.commandLine = new CommandLineController(this.client, {
                                onAccepted: this.onCmdAccept,
                                onCanceled: this.onCmdCancel,
                                onChanged: this.onCmdChange,
                            });
                        }
                        this.commandLine.show(allContent, firstc, prompt);
                    } else {
                        // if there is initial content and it's not currently displayed then it may come
                        // from some mapping. to prevent bad UI commandline transition we delay cmdline appearing here
                        if (allContent !== "" && allContent !== "'<,'>" && !this.commandLine) {
                            this.cmdlineTimer = setTimeout(() => this.showCmdOnTimer(allContent, firstc, prompt), 200);
                        } else {
                            if (!this.commandLine) {
                                this.commandLine = new CommandLineController(this.client, {
                                    onAccepted: this.onCmdAccept,
                                    onCanceled: this.onCmdCancel,
                                    onChanged: this.onCmdChange,
                                });
                            }
                            this.commandLine.show(allContent, firstc, prompt);
                        }
                    }
                    break;
                }
                case "wildmenu_show": {
                    const [items] = firstArg as [string[]];
                    if (this.commandLine) {
                        this.commandLine.setCompletionItems(items);
                    }
                    break;
                }
                case "cmdline_hide": {
                    if (this.cmdlineTimer) {
                        clearTimeout(this.cmdlineTimer);
                        this.cmdlineTimer = undefined;
                    } else if (this.commandLine) {
                        this.commandLine.cancel(true);
                        this.commandLine.dispose();
                        this.commandLine = undefined;
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
                            screenPos: 0,
                            screenLine: 0,
                            topScreenLineStr: "      1 ",
                            bottomScreenLineStr: "    201 ",
                        });
                    } else {
                        const conf = this.grids.get(grid)!;
                        if (!conf.winId) {
                            conf.winId = win.id;
                        }
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
                                screenPos: 0,
                                screenLine: 0,
                                topScreenLineStr: "      1 ",
                                bottomScreenLineStr: "    201 ",
                            });
                        } else {
                            const conf = this.grids.get(grid)!;
                            if (!conf.winId) {
                                conf.winId = win.id;
                            }
                        }
                    }
                    break;
                }
                // nvim may not send grid_cursor_goto and instead uses grid_scroll along with grid_line
                case "grid_scroll": {
                    for (const [grid, , , , , by] of args as [number, number, number, null, number, number, number][]) {
                        if (grid === 1) {
                            continue;
                        }
                        gridCursorUpdates.add(grid);
                        // by > 0 - scroll down, must remove existing elements from first and shift row hl left
                        // by < 0 - scroll up, must remove existing elements from right shift row hl right
                        this.highlightProvider.shiftGridHighlights(grid, by);
                    }
                    break;
                }
                case "grid_cursor_goto": {
                    for (const [grid, screenRow, screenCol] of args as [number, number, number][]) {
                        const conf = this.grids.get(grid);
                        const normalizedScreenCol = screenCol - NUMBER_COLUMN_WIDTH;
                        if (conf) {
                            conf.screenLine = screenRow;
                            conf.screenPos = normalizedScreenCol;
                            gridCursorUpdates.add(grid);
                        }
                    }
                    break;
                }
                case "grid_line": {
                    // [grid, row, colStart, cells: [text, hlId, repeat]]
                    const gridEvents = args as Utils.GridLineEvent[];
                    // align topScreenLine if needed. we need to look for both FIRST_SCREEN_LINE and LAST_SCREEN_LINE because nvim may replace lines only at bottom/top
                    const firstLinesEvents = gridEvents.filter(
                        ([, line, , cells]) =>
                            line === this.FIRST_SCREEN_LINE && cells[0] && cells[0][1] === this.numberLineHlId,
                    );
                    const lastLinesEvents = gridEvents.filter(
                        ([, line, , cells]) =>
                            line === this.LAST_SCREEN_LINE && cells[0] && cells[0][1] === this.numberLineHlId,
                    );
                    for (const evt of firstLinesEvents) {
                        const [grid] = evt;
                        let gridConf = this.grids.get(grid);
                        if (!gridConf) {
                            gridConf = {
                                cursorLine: 0,
                                cursorPos: 0,
                                screenPos: 0,
                                screenLine: 0,
                                topScreenLineStr: "      1 ",
                                bottomScreenLineStr: "    201 ",
                                winId: 0,
                            };
                            this.grids.set(grid, gridConf);
                        }
                        const topLineStr = Utils.processLineNumberStringFromEvent(
                            evt,
                            this.numberLineHlId,
                            gridConf.topScreenLineStr,
                        );
                        const topLine = Utils.getLineFromLineNumberString(topLineStr);
                        const bottomLine = topLine + this.LAST_SCREEN_LINE;
                        const bottomLineStr = Utils.convertLineNumberToString(bottomLine + 1);

                        gridConf.topScreenLineStr = topLineStr;
                        gridConf.bottomScreenLineStr = bottomLineStr;
                        // !important don't put cursor update
                        // gridCursorUpdates.add(grid);
                    }
                    for (const evt of lastLinesEvents) {
                        const [grid] = evt;
                        let gridConf = this.grids.get(grid);
                        if (!gridConf) {
                            gridConf = {
                                cursorLine: 0,
                                cursorPos: 0,
                                screenPos: 0,
                                screenLine: 0,
                                topScreenLineStr: "      1 ",
                                bottomScreenLineStr: "    201 ",
                                winId: 0,
                            };
                            this.grids.set(grid, gridConf);
                        }
                        const bottomLineStr = Utils.processLineNumberStringFromEvent(
                            evt,
                            this.numberLineHlId,
                            gridConf.bottomScreenLineStr,
                        );
                        const bottomLine = Utils.getLineFromLineNumberString(bottomLineStr);
                        const topLine = bottomLine - this.LAST_SCREEN_LINE;
                        //
                        const topLineStr = Utils.convertLineNumberToString(topLine + 1);
                        gridConf.bottomScreenLineStr = bottomLineStr;
                        gridConf.topScreenLineStr = topLineStr;
                        // gridCursorUpdates.add(grid);
                    }

                    // eslint-disable-next-line prefer-const
                    for (let [grid, row, colStart, cells] of gridEvents) {
                        if (row > this.LAST_SCREEN_LINE) {
                            continue;
                        }
                        const gridConf = this.grids.get(grid);
                        if (!gridConf) {
                            continue;
                        }
                        const columnToWinId = [...this.editorColumnIdToWinId].find(([, id]) => id === gridConf.winId);
                        if (!columnToWinId) {
                            continue;
                        }

                        const editor = vscode.window.visibleTextEditors.find((e) => e.viewColumn === columnToWinId[0]);
                        if (!editor) {
                            continue;
                        }
                        // const topScreenLine = gridConf.cursorLine === 0 ? 0 : gridConf.cursorLine - gridConf.screenLine;
                        const topScreenLine = Utils.getLineFromLineNumberString(gridConf.topScreenLineStr);
                        const highlightLine = topScreenLine + row;
                        if (highlightLine >= editor.document.lineCount || highlightLine < 0) {
                            if (highlightLine > 0) {
                                this.highlightProvider.cleanRow(grid, row);
                            }
                            continue;
                        }
                        const uri = editor.document.uri.toString();
                        const buf = this.uriToBuffer.get(uri);
                        const isExternal = buf && this.managedBufferIds.has(buf.id) ? false : true;
                        let finalStartCol = 0;
                        if (cells[0] && cells[0][1] === this.numberLineHlId) {
                            // remove linenumber cells
                            const firstTextIdx = cells.findIndex((c) => c[1] != null && c[1] !== this.numberLineHlId);
                            if (firstTextIdx === -1) {
                                continue;
                            }
                            cells = cells.slice(firstTextIdx);
                        } else if (colStart === NUMBER_COLUMN_WIDTH) {
                            finalStartCol = 0;
                        } else {
                            const line = editor.document.lineAt(highlightLine).text;
                            // shift left start col (in vim linenumber is accounted, while in vscode don't)
                            // finalStartCol = Utils.getStartColForHL(line, colStart - NUMBER_COLUMN_WIDTH);
                            finalStartCol = Utils.calculateEditorColFromVimScreenCol(
                                line,
                                colStart - NUMBER_COLUMN_WIDTH,
                            );
                        }
                        this.highlightProvider.processHLCellsEvent(grid, row, finalStartCol, isExternal, cells);
                        gridHLUpdates.add(grid);
                    }
                    break;
                }
            }
        }
        // this.applyRedrawUpdate(newModeName, gridCursorUpdates, gridHLUpdates, acceptPrompt);
    };

    private applyRedrawUpdate = (
        newModeName: string | undefined,
        cursorUpdates: Set<number>,
        hlUpdates: Set<number>,
        acceptPrompt: boolean,
    ): void => {
        for (const grid of cursorUpdates) {
            const gridConf = this.grids.get(grid);
            if (!gridConf) {
                continue;
            }
            const columnConf = [...this.editorColumnIdToWinId].find(([, winId]) => winId === gridConf.winId);
            if (!columnConf) {
                continue;
            }
            const editor = vscode.window.visibleTextEditors.find((e) => e.viewColumn === columnConf[0]);
            if (!editor) {
                continue;
            }
            if (editor === vscode.window.activeTextEditor && this.ignoreNextCursorUpdate) {
                this.ignoreNextCursorUpdate = false;
                continue;
            }
            const cursor = Utils.getEditorCursorPos(editor, gridConf);
            const currentCursor = editor.selection.active;
            if (currentCursor.line === cursor.line && currentCursor.character === cursor.col) {
                continue;
            }
            gridConf.cursorLine = cursor.line;
            gridConf.cursorPos = cursor.col;
            // allow to update cursor only for active editor
            if (editor === vscode.window.activeTextEditor) {
                // this.updateCursorPosInEditor(editor, cursor.line, cursor.col);
            }
        }

        for (const grid of hlUpdates) {
            const gridConf = this.grids.get(grid);
            if (!gridConf) {
                continue;
            }
            const columnToWinId = [...this.editorColumnIdToWinId].find(([, id]) => id === gridConf.winId);
            if (!columnToWinId) {
                continue;
            }
            const editor = vscode.window.visibleTextEditors.find((e) => e.viewColumn === columnToWinId[0]);
            if (!editor) {
                continue;
            }
            const hls = this.highlightProvider.getGridHighlights(
                grid,
                Utils.getLineFromLineNumberString(gridConf.topScreenLineStr),
            );
            for (const [decorator, ranges] of hls) {
                editor.setDecorations(decorator, ranges);
            }
        }
        if (acceptPrompt) {
            this.client.input("<CR>");
        }
    };

    private multipleCursorFromVisualMode(
        append: boolean,
        visualMode: string,
        startLine: number,
        endLine: number,
        skipEmpty: boolean,
    ): void {
        if (!vscode.window.activeTextEditor) {
            return;
        }
        if (this.currentModeName !== "visual") {
            return;
        }
        const currentCursorPos = vscode.window.activeTextEditor.selection.active;
        const newSelections: vscode.Selection[] = [];
        const doc = vscode.window.activeTextEditor.document;
        for (let line = startLine; line <= endLine; line++) {
            const lineDef = doc.lineAt(line);
            // always skip empty lines for visual block mode
            if (lineDef.text.trim() === "" && (skipEmpty || visualMode !== "V")) {
                continue;
            }
            let char = 0;
            if (visualMode === "V") {
                char = append ? lineDef.range.end.character : lineDef.firstNonWhitespaceCharacterIndex;
            } else {
                char = append ? currentCursorPos.character + 1 : currentCursorPos.character;
            }
            newSelections.push(new vscode.Selection(line, char, line, char));
        }
        this.leaveMultipleCursorsForVisualMode = true;
        vscode.window.activeTextEditor.selections = newSelections;
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
            const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri);
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
                editor.edit((b) => b.insert(new vscode.Position(0, 0), lines.join("\n")));
                vscode.commands.executeCommand("editor.action.indentationToSpaces");
            }
            return;
        }
        // if (!name) {
        // return;
        // }

        const buffers = await this.client.buffers;
        // get buffer handle
        const buf = buffers.find((b) => b.id === id);
        if (!buf) {
            return;
        }
        // :help, PlugStatus etc opens new window. close it and attach to existing window instead
        const windows = await this.client.windows;
        const possibleBufWindow = windows.find(
            (w) => ![...this.editorColumnIdToWinId].find(([, winId]) => w.id === winId),
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
        // this.client.attachBuffer(buf, "lines", this.onNeovimBufferEvent);
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
        if (!lines.length || lines.every((l) => !l.length)) {
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
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        const decorator = this.highlightProvider.getDecoratorForHighlightGroup(hlGroupName);
        if (!decorator) {
            return;
        }
        const conf = this.highlightProvider.getDecoratorOptions(decorator);
        const options: vscode.DecorationOptions[] = [];
        for (const [lineStr, cols] of decorations) {
            try {
                const lineNum = parseInt(lineStr, 10) - 1;
                const line = editor.document.lineAt(lineNum).text;

                for (const [colNum, text] of cols) {
                    // vim sends column in bytes, need to convert to characters
                    // const col = colNum - 1;
                    const col = Utils.convertByteNumToCharNum(line, colNum - 1);
                    const opt: vscode.DecorationOptions = {
                        range: new vscode.Range(lineNum, col, lineNum, col),
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
            } catch {
                // ignore
            }
        }
        editor.setDecorations(decorator, options);
    }

    // private handleCustomRequest = async (
    //     eventName: string,
    //     eventArgs: [string, ...unknown[]],
    //     response: RequestResponse,
    // ): Promise<void> => {
    //     try {
    //         let result: unknown;
    //         if (eventName === "vscode-command") {
    //             const [vscodeCommand, commandArgs] = eventArgs as [string, unknown[]];
    //             result = await this.handleVSCodeCommand(
    //                 vscodeCommand,
    //                 Array.isArray(commandArgs) ? commandArgs : [commandArgs],
    //             );
    //         } else if (eventName === "vscode-range-command") {
    //             const [vscodeCommand, line1, line2, pos1, pos2, leaveSelection, commandArgs] = eventArgs as [
    //                 string,
    //                 number,
    //                 number,
    //                 number,
    //                 number,
    //                 number,
    //                 unknown[],
    //             ];
    //             result = await this.handleVSCodeRangeCommand(
    //                 vscodeCommand,
    //                 line1,
    //                 line2,
    //                 pos1,
    //                 pos2,
    //                 !!leaveSelection,
    //                 Array.isArray(commandArgs) ? commandArgs : [commandArgs],
    //             );
    //         } else if (eventName === "vscode-neovim") {
    //             const [command, commandArgs] = eventArgs as [string, unknown[]];
    //             result = await this.handleExtensionRequest(command, commandArgs);
    //         }
    //         response.send(result || "", false);
    //     } catch (e) {
    //         response.send(e.message, true);
    //     }
    // };

    private async handleVSCodeCommand(command: string, args: unknown[]): Promise<unknown> {
        return await this.runVSCodeCommand(command, ...args);
    }

    /**
     * Produce vscode selection and execute command
     * @param command VSCode command to execute
     * @param startLine Start line to select. 1based
     * @param endLine End line to select. 1based
     * @param startPos Start pos to select. 1based. If 0 then whole line will be selected
     * @param endPos End pos to select, 1based. If you then whole line will be selected
     * @param leaveSelection When true won't clear vscode selection after running the command
     * @param args Additional args
     */
    private async handleVSCodeRangeCommand(
        command: string,
        startLine: number,
        endLine: number,
        startPos: number,
        endPos: number,
        leaveSelection: boolean,
        args: unknown[],
    ): Promise<unknown> {
        const e = vscode.window.activeTextEditor;
        if (e) {
            // vi<obj> includes end of line from start pos. This is not very useful, so let's check and remove it
            // vi<obj> always select from top to bottom
            if (endLine > startLine) {
                try {
                    const lineDef = e.document.lineAt(startLine - 1);
                    if (startPos > 0 && startPos - 1 >= lineDef.range.end.character) {
                        startLine++;
                        startPos = 0;
                    }
                } catch {
                    // ignore
                }
            }
            this.shouldIgnoreMouseSelection = true;
            const prevSelections = [...e.selections];
            // startLine is visual start
            if (startLine > endLine) {
                e.selections = [
                    new vscode.Selection(
                        startLine - 1,
                        startPos > 0 ? startPos - 1 : 9999999,
                        endLine - 1,
                        endPos > 0 ? endPos - 1 : 0,
                    ),
                ];
            } else {
                e.selections = [
                    new vscode.Selection(
                        startLine - 1,
                        startPos > 0 ? startPos - 1 : 0,
                        endLine - 1,
                        endPos > 0 ? endPos - 1 : 9999999,
                    ),
                ];
            }
            const res = await this.runVSCodeCommand(command, ...args);
            if (!leaveSelection) {
                e.selections = prevSelections;
            }
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
                        let doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === name);
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
                const [append, visualMode, startLine1Based, endLine1Based, skipEmpty] = args as any;
                this.multipleCursorFromVisualMode(
                    !!append,
                    visualMode,
                    startLine1Based - 1,
                    endLine1Based - 1,
                    !!skipEmpty,
                );
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
                // this.isRecording = true;
                break;
            }
            case "insert-line": {
                const [type] = args as ["before" | "after"];
                // need to ignore cursor update to prevent cursor jumping
                this.ignoreNextCursorUpdate = true;
                await this.client.command("startinsert");
                this.dotRepeatInsertModeStartHint = type === "before" ? "O" : "o";
                await vscode.commands.executeCommand(
                    type === "before" ? "editor.action.insertLineBefore" : "editor.action.insertLineAfter",
                );
                // grid_cursor_goto will unset it, butt let's make sure
                this.ignoreNextCursorUpdate = false;
                break;
            }
        }
    }

    private runVSCodeCommand = async (commandName: string, ...args: unknown[]): Promise<unknown> => {
        const res = await vscode.commands.executeCommand(commandName, ...args);
        return res;
    };

    private syncLastChangesWithDotRepeat = async (): Promise<void> => {
        // dot-repeat executes last change across all buffers. So we'll create a temporary buffer & window,
        // replay last changes here to trick neovim and destroy it after
        if (!this.lastChange) {
            return;
        }
        const lastChange = { ...this.lastChange };
        this.lastChange = undefined;
        const currEditor = vscode.window.activeTextEditor;
        if (!currEditor) {
            return;
        }
        const currBuf = this.uriToBuffer.get(currEditor.document.uri.toString());
        if (!currBuf) {
            return;
        }
        const eol = currEditor.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
        const currWinId = this.editorColumnIdToWinId.get(currEditor.viewColumn || -1);
        if (!currWinId) {
            return;
        }

        // temporary buffer to replay the changes
        const buf = await this.client.createBuffer(false, true);
        if (typeof buf === "number") {
            return;
        }
        // create temporary win
        const win = await this.client.openWindow(buf, true, {
            external: true,
            width: this.NEOVIM_WIN_WIDTH,
            height: this.NEOVIM_WIN_HEIGHT,
        });
        if (typeof win === "number") {
            return;
        }
        const edits: [string, unknown[]][] = [];

        // for delete changes we need an actual text, so let's prefill with something
        // accumulate all possible lengths of deleted text to be safe
        const delRangeLength = lastChange.rangeLength;
        if (delRangeLength) {
            const stub = new Array(delRangeLength).fill("x").join("");
            edits.push(
                ["nvim_buf_set_lines", [buf.id, 0, 0, false, [stub]]],
                ["nvim_win_set_cursor", [win.id, [1, delRangeLength]]],
            );
        }
        let editStr = "";
        if (lastChange.startMode) {
            editStr += `<Esc>${lastChange.startMode === "O" ? "mO" : "mo"}`;
            // remove EOL from first change
            if (lastChange.text.startsWith(eol)) {
                lastChange.text = lastChange.text.slice(eol.length);
            }
        }
        if (lastChange.rangeLength) {
            editStr += [...new Array(lastChange.rangeLength).keys()].map(() => "<BS>").join("");
        }
        editStr += lastChange.text.split(eol).join("\n").replace("<", "<LT>");
        edits.push(["nvim_input", [editStr]]);
        // since nvim_input is not blocking we need replay edits first, then clean up things in subsequent request
        await this.client.callAtomic(edits);

        const cleanEdits: [string, unknown[]][] = [];
        cleanEdits.push(["nvim_set_current_win", [currWinId]]);
        cleanEdits.push(["nvim_win_close", [win.id, true]]);
        cleanEdits.push(["nvim_command", [`bwipeout! ${buf.id}`]]);
        await this.client.callAtomic(cleanEdits);
    };

    private showCmdOnTimer = (initialContent: string, firstc: string, prompt: string): void => {
        if (!this.commandLine) {
            this.commandLine = new CommandLineController(this.client, {
                onAccepted: this.onCmdAccept,
                onCanceled: this.onCmdCancel,
                onChanged: this.onCmdChange,
            });
        }
        this.commandLine.show(initialContent, firstc, prompt);
        this.cmdlineTimer = undefined;
    };

    private onCmdChange = async (e: string, complete: boolean): Promise<void> => {
        let keys = "<C-u>" + Utils.normalizeInputString(e);
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

    private async checkNeovimVersion(): Promise<void> {
        const [, info] = await this.client.apiInfo;
        if (info.version.major === 0 && info.version.minor < 4) {
            // suggest to use 0.5.0 dev from beginning
            vscode.window.showErrorMessage("The extension requires neovim 0.5 dev or greater");
            return;
        }
        if (!info.ui_events.find((e) => e.name === "win_viewport")) {
            vscode.window.showWarningMessage(
                "Next version of vscode-neovim will require neovim 0.5 dev version, please upgrade",
            );
        }
    }
}
