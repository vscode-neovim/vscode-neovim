import { EventEmitter } from "events";

import { commands, Disposable } from "vscode";

import { Logger } from "./logger";
import { NeovimExtensionRequestProcessable } from "./neovim_events_processable";

const LOG_PREFIX = "ModeManager";

// a representation of the current mode. can be read in different ways using accessors. underlying type is raw name as returned by `:help mode()`
class Mode {
    public constructor(public raw: string = "") {}
    // mode 1-char code: n, v, V, i, s, ...
    // converts ^v into v
    public get char(): string {
        return this.raw.charCodeAt(0) == 22 ? "v" : this.raw.charAt(0);
    }
    // mode long name
    public get name(): "insert" | "visual" | "normal" {
        switch (this.char.toLowerCase()) {
            case "i":
                return "insert";
            case "v":
                return "visual";
            case "n":
            default:
                return "normal";
        }
    }
    // visual mode name
    public get visual(): "char" | "line" | "block" {
        return this.char === "V" ? "line" : this.raw.charAt(0) === "v" ? "char" : "block";
    }
}
export class ModeManager implements Disposable, NeovimExtensionRequestProcessable {
    private disposables: Disposable[] = [];
    /**
     * Current neovim mode
     */
    private mode: Mode = new Mode();
    /**
     * Last neovim mode
     */
    private last: Mode = new Mode();
    /**
     * True when macro recording in insert mode
     */
    private isRecording = false;
    private eventEmitter = new EventEmitter();

    public constructor(private logger: Logger) {}

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public get currentMode(): Mode {
        return this.mode;
    }

    public get lastMode(): Mode {
        return this.last;
    }

    public get isInsertMode(): boolean {
        return this.mode.name === "insert";
    }

    public get isVisualMode(): boolean {
        return this.mode.name === "visual";
    }

    public get isNormalMode(): boolean {
        return this.mode.name === "normal";
    }

    public get isRecordingInInsertMode(): boolean {
        return this.isRecording;
    }

    public onModeChange(callback: () => void): void {
        this.eventEmitter.on("neovimModeChanged", callback);
    }

    public async handleExtensionRequest(name: string, args: unknown[]): Promise<void> {
        switch (name) {
            case "mode-changed": {
                const [oldMode, newMode] = args as [string, string];
                this.logger.debug(`${LOG_PREFIX}: Changing mode from ${oldMode} to ${newMode}`);
                this.mode = new Mode(newMode);
                this.last = new Mode(oldMode);
                if (!this.isInsertMode && this.isRecording) {
                    this.isRecording = false;
                    commands.executeCommand("setContext", "neovim.recording", false);
                }
                commands.executeCommand("setContext", "neovim.mode", this.mode.name);
                this.eventEmitter.emit("neovimModeChanged");
                break;
            }
            case "notify-recording": {
                this.logger.debug(`${LOG_PREFIX}: setting recording flag`);
                this.isRecording = true;
                commands.executeCommand("setContext", "neovim.recording", true);
                break;
            }
        }
    }
}
