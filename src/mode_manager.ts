import { EventEmitter } from "events";

import { commands, Disposable } from "vscode";

import { createLogger } from "./logger";
import { eventBus } from "./eventBus";

const logger = createLogger("ModeManager");

// a representation of the current mode. can be read in different ways using accessors. underlying type is shortname name as returned by `:help mode()`
export class Mode {
    public constructor(public shortname: string = "") {}
    // mode 1-char code: n, v, V, i, s, ...
    // converts ^v into v
    public get char(): string {
        return this.shortname.charAt(0).replace("\x16", "v");
    }
    // mode long name
    public get name(): "insert" | "visual" | "cmdline" | "replace" | "normal" {
        switch (this.char.toLowerCase()) {
            case "i":
                return "insert";
            case "v":
                return "visual";
            case "c":
                return "cmdline";
            case "r":
                return "replace";
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
export class ModeManager implements Disposable {
    private disposables: Disposable[] = [];
    /**
     * Current neovim mode
     */
    private mode: Mode = new Mode("n");
    /**
     * True when macro recording in insert mode
     */
    private isRecording = false;
    private eventEmitter = new EventEmitter();

    constructor() {
        eventBus.on(
            "mode-changed",
            ([mode]) => {
                logger.debug(`Changing mode to ${mode}`);
                this.mode = new Mode(mode);
                if (!this.isInsertMode && this.isRecording) {
                    this.isRecording = false;
                    commands.executeCommand("setContext", "neovim.recording", false);
                }
                commands.executeCommand("setContext", "neovim.mode", this.mode.name);
                logger.debug(`Setting mode context to ${this.mode.name}`);
                this.eventEmitter.emit("neovimModeChanged");
            },
            this,
            this.disposables,
        );
        eventBus.on(
            "notify-recording",
            () => {
                logger.debug(`setting recording flag`);
                this.isRecording = true;
                commands.executeCommand("setContext", "neovim.recording", true);
            },
            this,
            this.disposables,
        );
    }

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
}
