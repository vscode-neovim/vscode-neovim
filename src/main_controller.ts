/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChildProcess, execSync, spawn } from "child_process";
import { readFile } from "fs/promises";
import path from "path";

import { attach, NeovimClient } from "neovim";
import vscode from "vscode";
// eslint-disable-next-line import/no-extraneous-dependencies
import { transports as loggerTransports, createLogger as winstonCreateLogger } from "winston";

import { BufferManager } from "./buffer_manager";
import { CommandLineManager } from "./command_line_manager";
import { CommandsController } from "./commands_controller";
import { config } from "./config";
import { CursorManager } from "./cursor_manager";
import { CustomCommandsManager } from "./custom_commands_manager";
import { DocumentChangeManager } from "./document_change_manager";
import { eventBus } from "./eventBus";
import { HighlightManager } from "./highlight_manager";
import { createLogger } from "./logger";
import { ModeManager } from "./mode_manager";
import { MultilineMessagesManager } from "./multiline_messages_manager";
import { NeovimCommandProcessable, NeovimExtensionRequestProcessable } from "./neovim_events_processable";
import { StatusLineManager } from "./status_line_manager";
import { TypingManager } from "./typing_manager";
import { findLastEvent } from "./utils";
import { ViewportManager } from "./viewport_manager";

interface RequestResponse {
    send(resp: unknown, isError?: boolean): void;
}

const logger = createLogger("MainController");

export class MainController implements vscode.Disposable {
    private nvimProc: ChildProcess;
    public client: NeovimClient;

    private disposables: vscode.Disposable[] = [];

    /**
     * Neovim API states that multiple redraw batches could be sent following flush() after last batch
     * Save current batch into temp variable
     */
    private currentRedrawBatch: [string, ...unknown[]][] = [];

    public modeManager!: ModeManager;
    public bufferManager!: BufferManager;
    public changeManager!: DocumentChangeManager;
    public typingManager!: TypingManager;
    public cursorManager!: CursorManager;
    public commandsController!: CommandsController;
    public commandLineManager!: CommandLineManager;
    public statusLineManager!: StatusLineManager;
    public highlightManager!: HighlightManager;
    public customCommandsManager!: CustomCommandsManager;
    public multilineMessagesManager!: MultilineMessagesManager;
    public viewportManager!: ViewportManager;

    public constructor(private extensionPath: string) {
        if (config.useWsl) {
            // execSync returns a newline character at the end
            this.extensionPath = extensionPath = execSync(`C:\\Windows\\system32\\wsl.exe wslpath '${extensionPath}'`)
                .toString()
                .trim();
        }

        // These paths get called inside WSL, they must be POSIX paths (forward slashes)
        const neovimPreScriptPath = path.posix.join(extensionPath, "vim", "vscode-neovim.vim");
        const neovimPostScriptPath = path.posix.join(extensionPath, "runtime/lua", "vscode-neovim/force-options.lua");

        const args = [
            "-N",
            "--embed",
            // load options after user config
            "-S",
            neovimPostScriptPath,
            // load support script before user config (to allow to rebind keybindings/commands)
            "--cmd",
            `source ${neovimPreScriptPath}`,
        ];

        const workspaceFolder = vscode.workspace.workspaceFolders;
        const cwd = workspaceFolder && workspaceFolder.length ? workspaceFolder[0].uri.fsPath : undefined;
        if (cwd && !config.useWsl && !vscode.env.remoteName) {
            args.push("-c", `cd ${cwd}`);
        }

        if (config.useWsl) {
            args.unshift(config.neovimPath);
        }
        if (parseInt(process.env.NEOVIM_DEBUG || "", 10) === 1) {
            args.push(
                "-u",
                "NONE",
                "--listen",
                `${process.env.NEOVIM_DEBUG_HOST || "127.0.0.1"}:${process.env.NEOVIM_DEBUG_PORT || 4000}`,
            );
        }
        if (config.clean) {
            args.push("--clean");
        }
        // #1162
        if (!config.clean && config.neovimInitPath) {
            args.push("-u", config.neovimInitPath);
        }
        logger.debug(
            `Spawning nvim, path: ${config.neovimPath}, useWsl: ${config.useWsl}, args: ${JSON.stringify(args)}`,
        );
        if (config.NVIM_APPNAME) {
            process.env.NVIM_APPNAME = config.NVIM_APPNAME;
            if (config.useWsl) {
                /*
                 * `/u` flag indicates the value should only be included when invoking WSL from Win32.
                 * https://devblogs.microsoft.com/commandline/share-environment-vars-between-wsl-and-windows/#u
                 */
                process.env.WSLENV = "NVIM_APPNAME/u";
            }
        }
        this.nvimProc = spawn(config.useWsl ? "C:\\Windows\\system32\\wsl.exe" : config.neovimPath, args, {});
        this.nvimProc.on("close", (code) => {
            logger.error(`Neovim exited with code: ${code}`);
        });
        this.nvimProc.on("error", (err) => {
            logger.error(`Neovim spawn error: ${err.message}. Check if the path is correct.`);
            vscode.window.showErrorMessage("Neovim: configure the path to neovim and restart the editor");
        });
        logger.debug(`Attaching to neovim`);
        this.client = attach({
            proc: this.nvimProc,
            options: {
                logger: winstonCreateLogger({
                    transports: [new loggerTransports.Console()],
                    level: "error",
                    exitOnError: false,
                }),
            },
        });
    }

    private setClientInfo() {
        readFile(path.posix.join(this.extensionPath, "package.json"))
            .then((buffer) => {
                const versionString = JSON.parse(buffer.toString()).version as string;
                const [major, minor, patch] = [...versionString.split(".").map((n) => +n), 0, 0, 0];
                this.client.setClientInfo("vscode-neovim", { major, minor, patch }, "embedder", {}, {});
            })
            .catch((err) => console.log(err));
    }

    public async init(): Promise<void> {
        logger.debug(`Init, attaching to neovim notifications`);
        this.client.on("disconnect", () => {
            logger.error(`Neovim was disconnected`);
        });
        this.client.on("notification", this.onNeovimNotification);
        this.client.on("request", this.handleCustomRequest);
        this.setClientInfo();
        await this.checkNeovimVersion();
        const channel = await this.client.channelId;
        await this.client.setVar("vscode_channel", channel);

        this.disposables.push(
            vscode.commands.registerCommand("_getNeovimClient", () => this.client),
            (this.modeManager = new ModeManager()),
            (this.typingManager = new TypingManager(this)),
            (this.bufferManager = new BufferManager(this)),
            (this.viewportManager = new ViewportManager(this)),
            (this.cursorManager = new CursorManager(this)),
            (this.commandsController = new CommandsController(this)),
            (this.highlightManager = new HighlightManager(this)),
            (this.changeManager = new DocumentChangeManager(this)),
            (this.commandLineManager = new CommandLineManager(this)),
            (this.statusLineManager = new StatusLineManager(this)),
            (this.multilineMessagesManager = new MultilineMessagesManager()),
            (this.customCommandsManager = new CustomCommandsManager(this)),
        );

        logger.debug(`UIAttach`);
        // !Attach after setup of notifications, otherwise we can get blocking call and stuck
        await this.client.uiAttach(config.neovimViewportWidth, 100, {
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
        });

        await this.bufferManager.forceResync();

        await vscode.commands.executeCommand("setContext", "neovim.init", true);
        logger.debug(`Init completed`);
    }

    private onNeovimNotification = (method: string, events: [string, ...any[]]): void => {
        const extensionCommandManagers: NeovimExtensionRequestProcessable[] = [
            this.modeManager,
            this.changeManager,
            this.commandsController,
            this.customCommandsManager,
            this.bufferManager,
            this.viewportManager,
            this.cursorManager,
        ];
        const vscodeComandManagers: NeovimCommandProcessable[] = [this.customCommandsManager];

        if (method === "vscode-command") {
            const [vscodeCommand, commandArgs] = events as [string, unknown[]];
            vscodeComandManagers.forEach(async (m) => {
                try {
                    await m.handleVSCodeCommand(
                        vscodeCommand,
                        Array.isArray(commandArgs) ? commandArgs : [commandArgs],
                    );
                } catch (e) {
                    logger.error(
                        `${vscodeCommand} failed, args: ${JSON.stringify(commandArgs)} error: ${(e as Error).message}`,
                    );
                }
            });
            return;
        }
        if (method === "vscode-neovim") {
            const [command, args] = events;
            extensionCommandManagers.forEach((m) => {
                try {
                    m.handleExtensionRequest(command, args);
                } catch (e) {
                    logger.error(`${command} failed, args: ${JSON.stringify(args)} error: ${(e as Error).message}`);
                }
            });
            return;
        }
        if (method === "redraw") {
            const redrawEvents = events as [string, ...any[]][];
            const hasFlush = findLastEvent("flush", events);
            if (hasFlush) {
                const batch = [...this.currentRedrawBatch.splice(0), ...redrawEvents];
                const eventData = batch.map(
                    (b) =>
                        ({
                            name: b[0],
                            args: b.slice(1),
                            get firstArg() {
                                return this.args[0];
                            },
                            get lastArg() {
                                return this.args[this.args.length - 1];
                            },
                        }) as any,
                );
                eventBus.fire("redraw", eventData);
            } else {
                this.currentRedrawBatch.push(...redrawEvents);
            }
        }
    };

    private handleCustomRequest = async (
        eventName: string,
        eventArgs: [string, ...unknown[]],
        response: RequestResponse,
    ): Promise<void> => {
        const extensionCommandManagers: NeovimExtensionRequestProcessable[] = [
            this.modeManager,
            this.changeManager,
            this.commandsController,
            this.customCommandsManager,
            this.bufferManager,
            this.cursorManager,
        ];
        const vscodeCommandManagers: NeovimCommandProcessable[] = [this.customCommandsManager];
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
            response.send((e as Error).message, true);
        }
    };

    private async checkNeovimVersion(): Promise<void> {
        const minVersion = [0, 9, 0];
        // It is necessary to check the functionalities added in the minimum version
        // because users might be using the development version with incomplete functionalities.
        const requirements = {
            options: ["statuscolumn"],
            functions: ["nvim_exec2"],
        };
        // check version
        {
            const [, info] = await this.client.apiInfo;
            const { major, minor, patch } = info.version;
            const currVersion = [major, minor, patch];
            let outdated = false;
            for (let i = 0; i < 3; i++) {
                if (currVersion[i] < minVersion[i]) {
                    outdated = true;
                    break;
                }
                if (currVersion[i] > minVersion[i]) {
                    break;
                }
            }
            if (outdated) {
                vscode.window.showErrorMessage(
                    `The extension requires Neovim version ${minVersion} or higher, preferably the [latest stable release](https://github.com/neovim/neovim/releases/tag/stable)`,
                );
                return;
            }
        }
        // check nvim features
        const exprs = [...requirements.options.map((o) => `&${o}`), ...requirements.functions.map((f) => `*${f}`)];
        const rets: number[] = [];
        for (const e of exprs) {
            // this.client.callAtomic is not usefull
            rets.push(await this.client.call("exists", [e]));
        }
        const missingOptions: string[] = [];
        const missingFunctions: string[] = [];
        rets.forEach((r, i) => {
            if (!r) {
                const expr = exprs[i];
                if (expr.startsWith("&")) {
                    missingOptions.push(expr.substring(1));
                } else if (expr.startsWith("*")) {
                    missingFunctions.push(expr.substring(1));
                }
            }
        });
        const errMsgs = [
            "Your nvim does not support the following features. Please check and update your nvim to the [latest stable version](https://github.com/neovim/neovim/releases/tag/stable). ",
        ];
        if (missingOptions.length) errMsgs.push("Missing options: " + missingOptions.join(", ") + ". ");
        if (missingFunctions.length) errMsgs.push("Missing functions: " + missingFunctions.join(", ") + ". ");
        if (errMsgs.length > 1) {
            vscode.window.showErrorMessage(errMsgs.join(" "));
        }
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.client.quit();
    }
}
