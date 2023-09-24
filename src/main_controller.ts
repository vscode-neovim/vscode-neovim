import { ChildProcess, execSync, spawn } from "child_process";
import path from "path";

import { attach, NeovimClient } from "neovim";
import vscode from "vscode";
// eslint-disable-next-line import/no-extraneous-dependencies
import { createLogger, transports as loggerTransports } from "winston";

import { BufferManager } from "./buffer_manager";
import { CommandLineManager } from "./command_line_manager";
import { CommandsController } from "./commands_controller";
import { config } from "./config";
import { EXT_ID } from "./constants";
import { CursorManager } from "./cursor_manager";
import { CustomCommandsManager } from "./custom_commands_manager";
import { DocumentChangeManager } from "./document_change_manager";
import { HighlightManager } from "./highlight_manager";
import { Logger, LogLevel } from "./logger";
import { ModeManager } from "./mode_manager";
import { MutlilineMessagesManager } from "./multiline_messages_manager";
import {
    NeovimCommandProcessable,
    NeovimExtensionRequestProcessable,
    NeovimRedrawProcessable,
} from "./neovim_events_processable";
import { StatusLineManager } from "./status_line_manager";
import { TypingManager } from "./typing_manager";
import { findLastEvent } from "./utils";
import { ViewportManager } from "./viewport_manager";

interface RequestResponse {
    send(resp: unknown, isError?: boolean): void;
}

const LOG_PREFIX = "MainController";

export class MainController implements vscode.Disposable {
    private nvimProc: ChildProcess;
    public client: NeovimClient;

    private disposables: vscode.Disposable[] = [];

    /**
     * Neovim API states that multiple redraw batches could be sent following flush() after last batch
     * Save current batch into temp variable
     */
    private currentRedrawBatch: [string, ...unknown[]][] = [];

    private logger!: Logger;

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
    public multilineMessagesManager!: MutlilineMessagesManager;
    public viewportManager!: ViewportManager;

    public constructor(extensionPath: string) {
        this.logger = new Logger(LogLevel[config.logLevel], config.logPath, config.outputToConsole);
        this.disposables.push(this.logger);
        if (config.useWsl) {
            // execSync returns a newline character at the end
            extensionPath = execSync(`C:\\Windows\\system32\\wsl.exe wslpath '${extensionPath}'`).toString().trim();
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
        if (config.neovimInitPath) {
            args.push("-u", config.neovimInitPath);
        }
        this.logger.debug(
            `${LOG_PREFIX}: Spawning nvim, path: ${config.neovimPath}, useWsl: ${config.useWsl}, args: ${JSON.stringify(
                args,
            )}`,
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
            this.logger.error(`${LOG_PREFIX}: Neovim exited with code: ${code}`);
        });
        this.nvimProc.on("error", (err) => {
            this.logger.error(`${LOG_PREFIX}: Neovim spawn error: ${err.message}. Check if the path is correct.`);
            vscode.window.showErrorMessage("Neovim: configure the path to neovim and restart the editor");
        });
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

        this.verifyExperimentalAffinity();
    }

    public async init(): Promise<void> {
        this.logger.debug(`${LOG_PREFIX}: Init, attaching to neovim notifications`);
        this.client.on("disconnect", () => {
            this.logger.error(`${LOG_PREFIX}: Neovim was disconnected`);
        });
        this.client.on("notification", this.onNeovimNotification);
        this.client.on("request", this.handleCustomRequest);

        await this.client.setClientInfo("vscode-neovim", { major: 0, minor: 1, patch: 0 }, "embedder", {}, {});
        await this.checkNeovimVersion();
        const channel = await this.client.channelId;
        await this.client.setVar("vscode_channel", channel);

        this.commandsController = new CommandsController(this.client);
        this.disposables.push(this.commandsController);

        this.modeManager = new ModeManager(this.logger);
        this.disposables.push(this.modeManager);

        this.bufferManager = new BufferManager(this.logger, this.client, this);
        this.disposables.push(this.bufferManager);

        this.viewportManager = new ViewportManager(this.logger, this.client, this);
        this.disposables.push(this.viewportManager);

        this.highlightManager = new HighlightManager(this);
        this.disposables.push(this.highlightManager);

        this.changeManager = new DocumentChangeManager(this.logger, this.client, this);
        this.disposables.push(this.changeManager);

        this.cursorManager = new CursorManager(this.logger, this.client, this);
        this.disposables.push(this.cursorManager);

        this.typingManager = new TypingManager(this.logger, this.client, this);
        this.disposables.push(this.typingManager);

        this.commandLineManager = new CommandLineManager(this.logger, this.client);
        this.disposables.push(this.commandLineManager);

        this.statusLineManager = new StatusLineManager(this.logger, this.client);
        this.disposables.push(this.statusLineManager);

        this.customCommandsManager = new CustomCommandsManager(this.logger, this);
        this.disposables.push(this.customCommandsManager);

        this.multilineMessagesManager = new MutlilineMessagesManager(this.logger);
        this.disposables.push(this.multilineMessagesManager);

        this.logger.debug(`${LOG_PREFIX}: UIAttach`);
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        await this.bufferManager.forceResync();

        await vscode.commands.executeCommand("setContext", "neovim.init", true);
        this.logger.debug(`${LOG_PREFIX}: Init completed`);
    }

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.client.quit();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private onNeovimNotification = (method: string, events: [string, ...any[]]): void => {
        // order matters here, modeManager should be processed first
        const redrawManagers: NeovimRedrawProcessable[] = [
            this.bufferManager,
            this.viewportManager,
            this.cursorManager,
            this.commandLineManager,
            this.statusLineManager,
            this.highlightManager,
            this.multilineMessagesManager,
        ];
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
                    this.logger.error(
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
                    this.logger.error(
                        `${command} failed, args: ${JSON.stringify(args)} error: ${(e as Error).message}`,
                    );
                }
            });
            return;
        }
        if (method !== "redraw") {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const redrawEvents = events as [string, ...any[]][];
        const hasFlush = findLastEvent("flush", events);

        if (hasFlush) {
            const batch = [...this.currentRedrawBatch.splice(0), ...redrawEvents];
            redrawManagers.forEach((m) => m.handleRedrawBatch(batch));
        } else {
            this.currentRedrawBatch.push(...redrawEvents);
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
        const [, info] = await this.client.apiInfo;
        if (
            (info.version.major === 0 && info.version.minor < 9) ||
            !info.ui_events.find((e) => e.name === "win_viewport")
        ) {
            vscode.window.showErrorMessage("The extension requires neovim 0.9 or greater");
            return;
        }
    }

    private async restartExtensionHostPrompt(message: string): Promise<void> {
        vscode.window.showInformationMessage(message, "Restart").then((value) => {
            if (value == "Restart") {
                this.logger.debug("Restarting extension host");
                vscode.commands.executeCommand("workbench.action.restartExtensionHost");
            }
        });
    }

    private async verifyExperimentalAffinity(): Promise<void> {
        const extensionsConfiguration = vscode.workspace.getConfiguration("extensions");
        const affinityConfiguration = extensionsConfiguration.inspect<{ [key: string]: [number] }>(
            "experimental.affinity",
        );

        const affinityConfigWorkspaceValue = affinityConfiguration?.workspaceValue;
        if (affinityConfigWorkspaceValue && EXT_ID in affinityConfigWorkspaceValue) {
            this.logger.debug(
                `Extension affinity value ${affinityConfigWorkspaceValue[EXT_ID]} found in Workspace settings`,
            );
            return;
        }

        const affinityConfigGlobalValue = affinityConfiguration?.globalValue;
        if (affinityConfigGlobalValue && EXT_ID in affinityConfigGlobalValue) {
            this.logger.debug(`Extension affinity value ${affinityConfigGlobalValue[EXT_ID]} found in User settings`);
            return;
        }

        this.logger.debug("Extension affinity value not set in User and Workspace settings");

        const defaultAffinity = 1;

        const setAffinity = (value: number): void => {
            this.logger.debug(`Setting extension affinity value to ${value} in User settings`);
            extensionsConfiguration
                .update("experimental.affinity", { ...affinityConfigGlobalValue, [EXT_ID]: value }, true)
                .then(
                    () => {
                        this.logger.debug(`Successfull set extension affinity value to ${value} in User settings`);
                    },
                    (error) => {
                        this.logger.error(`Error while setting experimental affinity. ${error}`);
                    },
                );
        };

        vscode.window
            .showWarningMessage(
                "No affinity assigned to vscode-neovim. It is recommended to assign affinity for major performance improvements. Would you like to set default affinity? [Learn more](https://github.com/vscode-neovim/vscode-neovim#affinity)",
                "Yes",
                "Cancel",
            )
            .then((value) => {
                if (value == "Yes") {
                    setAffinity(defaultAffinity);
                    this.restartExtensionHostPrompt(
                        "Requires restart of extension host for changes to take effect. This restarts all extensions.",
                    );
                }
            });
    }
}
