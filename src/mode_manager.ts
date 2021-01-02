import { EventEmitter } from "events";

import { NeovimClient } from "neovim";
import { commands, Disposable, window } from "vscode";

import { Logger } from "./logger";
import { NeovimExtensionRequestProcessable, NeovimRedrawProcessable } from "./neovim_events_processable";
import { findLastEvent } from "./utils";

const LOG_PREFIX = "ModeManager";

export class ModeManager implements Disposable, NeovimRedrawProcessable, NeovimExtensionRequestProcessable {
    private disposables: Disposable[] = [];
    /**
     * Current neovim mode
     */
    private mode = "";
    /**
     * True when macro recording in insert mode
     */
    private isRecording = false;

    private eventEmitter = new EventEmitter();

    public constructor(private logger: Logger, private client: NeovimClient) {
        this.disposables.push(window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor));
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public get currentMode(): string {
        return this.mode;
    }

    public get isInsertMode(): boolean {
        return this.mode === "insert";
    }

    public get isVisualMode(): boolean {
        return this.mode === "visual";
    }

    public get isNormalMode(): boolean {
        return this.mode === "normal";
    }

    public get isRecordingInInsertMode(): boolean {
        return this.isRecording;
    }

    public onModeChange(callback: (newMode: string) => void): void {
        this.eventEmitter.on("neovimModeChanged", callback);
    }

    public handleRedrawBatch(batch: [string, ...unknown[]][]): void {
        const lastModeChange = findLastEvent("mode_change", batch);
        if (lastModeChange) {
            const modeArg = lastModeChange[1] as [string, never] | undefined;
            if (modeArg && modeArg[0] && modeArg[0] !== this.mode) {
                const modeName = modeArg[0];
                this.logger.debug(`${LOG_PREFIX}: Changing mode to ${modeName}`);
                this.mode = modeName;
                if (!this.isInsertMode && this.isRecording) {
                    this.isRecording = false;
                    commands.executeCommand("setContext", "neovim.recording", false);
                }
                commands.executeCommand("setContext", "neovim.mode", this.mode);
                this.eventEmitter.emit("neovimModeChanged", modeName);
            }
        }
    }

    public async handleExtensionRequest(name: string): Promise<void> {
        if (name === "notify-recording") {
            this.logger.debug(`${LOG_PREFIX}: setting recording flag`);
            this.isRecording = true;
            commands.executeCommand("setContext", "neovim.recording", true);
        }
    }

    private onDidChangeActiveTextEditor = (): void => {
        if (!this.isNormalMode) {
            commands.executeCommand("vscode-neovim.escape");
        }
    };
}
