import { EventEmitter } from "events";

import { commands, Disposable } from "vscode";

import { Logger } from "./logger";
import { NeovimExtensionRequestProcessable } from "./neovim_events_processable";

const LOG_PREFIX = "ModeManager";

// a representation of the current mode. can be read in different ways using accessors. underlying type is shortname name as returned by `:help mode()`
export class Mode {
    public constructor(public shortname: string = "") {}
    // mode 1-char code: n, v, V, i, s, ...
    // converts ^v into v
    public get char(): string {
        return this.shortname.charAt(0).replace("\x16", "v");
    }
    // mode long name
    public get name(): "insert" | "visual" | "cmdline" | "normal" {
        switch (this.char.toLowerCase()) {
            case "i":
                return "insert";
            case "v":
                return "visual";
            case "c":
                return "cmdline";
            case "n":
            default:
                return "normal";
        }
    }
    // visual mode name
    public get visual(): "char" | "line" | "block" {
        return this.char === "V" ? "line" : this.shortname.charAt(0) === "v" ? "char" : "block";
    }
    public get isVisual(): boolean {
        return this.name === "visual";
    }
    public get isInsert(): boolean {
        return this.name === "insert";
    }
    public get isNormal(): boolean {
        return this.name === "normal";
    }
}
export class ModeManager implements Disposable, NeovimExtensionRequestProcessable {
    private disposables: Disposable[] = [];
    /**
     * Current neovim mode
     */
    private mode: Mode = new Mode();
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

    public get isInsertMode(): boolean {
        return this.mode.isInsert;
    }

    public get isVisualMode(): boolean {
        return this.mode.isVisual;
    }

    public get isNormalMode(): boolean {
        return this.mode.isNormal;
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
                const [mode] = args as [string];
                this.logger.debug(`${LOG_PREFIX}: Changing mode to ${mode}`);
                this.mode = new Mode(mode);
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
