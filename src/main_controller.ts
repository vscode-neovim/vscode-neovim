import { spawn, ChildProcess } from "child_process";
import path from "path";

import vscode from "vscode";
import { attach, NeovimClient } from "neovim";
// eslint-disable-next-line import/no-extraneous-dependencies
import { createLogger, transports as loggerTransports } from "winston";

import { HighlightConfiguration } from "./highlight_provider";
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
import { CommandLineManager } from "./command_line_manager";
import { StatusLineManager } from "./status_line_manager";
import { HighlightManager } from "./highlight_manager";
import { CustomCommandsManager } from "./custom_commands_manager";
import { findLastEvent } from "./utils";

interface RequestResponse {
    send(resp: unknown, isError?: boolean): void;
}

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

    private nvimProc: ChildProcess;
    private client: NeovimClient;

    private disposables: vscode.Disposable[] = [];

    /**
     * Neovim API states that multiple redraw batches could be sent following flush() after last batch
     * Save current batch into temp variable
     */
    private currentRedrawBatch: [string, ...unknown[]][] = [];

    private logger!: Logger;
    private settings: ControllerSettings;
    private modeManager!: ModeManager;
    private bufferManager!: BufferManager;
    private changeManager!: DocumentChangeManager;
    private typingManager!: TypingManager;
    private cursorManager!: CursorManager;
    private commandsController!: CommandsController;
    private commandLineManager!: CommandLineManager;
    private statusLineManager!: StatusLineManager;
    private highlightManager!: HighlightManager;
    private customCommandsManager!: CustomCommandsManager;

    public constructor(settings: ControllerSettings) {
        this.settings = settings;
        this.NEOVIM_WIN_HEIGHT = settings.neovimViewportHeight;
        this.NEOVIM_WIN_WIDTH = settings.neovimViewportWidth;
        if (!settings.neovimPath) {
            throw new Error("Neovim path is not defined");
        }
        this.logger = new Logger(LogLevel.debug, "/tmp/test.txt", true);
        this.disposables.push(this.logger);

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
    }

    public async init(): Promise<void> {
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

        this.commandLineManager = new CommandLineManager(this.logger, this.client);
        this.disposables.push(this.commandLineManager);

        this.statusLineManager = new StatusLineManager(this.logger, this.client);
        this.disposables.push(this.statusLineManager);

        this.highlightManager = new HighlightManager(this.logger, this.bufferManager, {
            highlight: this.settings.highlightsConfiguration,
            viewportHeight: this.settings.neovimViewportHeight,
        });
        this.disposables.push(this.highlightManager);

        this.customCommandsManager = new CustomCommandsManager(this.logger);
        this.disposables.push(this.customCommandsManager);

        this.logger.debug(`${LOG_PREFIX}: Attaching to neovim notifications`);
        this.client.on("notification", this.onNeovimNotification);
        this.client.on("request", this.handleCustomRequest);
        this.bufferManager.forceResync();

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
            this.modeManager,
            this.bufferManager,
            this.cursorManager,
            this.commandLineManager,
            this.statusLineManager,
            this.highlightManager,
        ];
        const extensionCommandManagers: NeovimExtensionRequestProcessable[] = [
            this.modeManager,
            this.changeManager,
            this.commandsController,
            this.bufferManager,
            this.highlightManager,
            this.cursorManager,
        ];
        const vscodeComandManagers: NeovimCommandProcessable[] = [this.customCommandsManager];
        const vscodeRangeCommandManagers: NeovimRangeCommandProcessable[] = [this.customCommandsManager];

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
                        `${vscodeCommand} failed, args: ${JSON.stringify(commandArgs)} error: ${e.message}`,
                    );
                }
            });
            return;
        }
        if (method === "vscode-range-command") {
            const [vscodeCommand, line1, line2, pos1, pos2, leaveSelection, args] = events;
            vscodeRangeCommandManagers.forEach((m) => {
                try {
                    m.handleVSCodeRangeCommand(
                        vscodeCommand,
                        line1,
                        line2,
                        pos1,
                        pos2,
                        !!leaveSelection,
                        Array.isArray(args) ? args : [args],
                    );
                } catch (e) {
                    this.logger.error(
                        `${vscodeCommand} failed, range: [${line1}, ${line2}, ${pos1}, ${pos2}] args: ${JSON.stringify(
                            args,
                        )} error: ${e.message}`,
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
                    this.logger.error(`${command} failed, args: ${JSON.stringify(args)} error: ${e.message}`);
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
            this.bufferManager,
            this.highlightManager,
            this.cursorManager,
        ];
        const vscodeCommandManagers: NeovimCommandProcessable[] = [this.customCommandsManager];
        const vscodeRangeCommandManagers: NeovimRangeCommandProcessable[] = [this.customCommandsManager];
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
