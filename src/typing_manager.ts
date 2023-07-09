import { NeovimClient } from "neovim";
import { commands, Disposable, TextEditor, TextEditorEdit, window } from "vscode";

import { Logger } from "./logger";
import { normalizeInputString } from "./utils";
import { MainController } from "./main_controller";

const LOG_PREFIX = "TypingManager";

export class TypingManager implements Disposable {
    private disposables: Disposable[] = [];
    /**
     * Separate "type" command disposable since we init/dispose it often
     */
    private typeHandlerDisposable?: Disposable;
    /**
     * Separate "replacePrevChar" command disposable since we init/dispose it often
     */
    private replacePrevCharHandlerDisposable?: Disposable;
    /**
     * Flag indicating that we're going to exit insert mode and sync buffers into neovim
     */
    private isExitingInsertMode = false;
    /**
     * Flag indicating if vscode-neovim is enabled or disabled
     */
    private neovimEnable = true;
    /**
     * Flag indicating that we're going to enter insert mode and there are pending document changes
     */
    private isEnteringInsertMode = false;
    /**
     * Additional keys which were pressed after exiting insert mode. We'll replay them after buffer sync
     */
    private pendingKeysAfterExit = "";
    /**
     * Additional keys which were pressed after entering the insert mode
     */
    private pendingKeysAfterEnter = "";
    /**
     * Timestamp when the first composite escape key was pressed. Using timestamp because timer may be delayed if the extension host is busy
     */
    private compositeEscapeFirstPressTimestamp?: number;
    /**
     * Composing flag
     */
    private isInComposition = false;
    /**
     * The text that we need to send to nvim after composition
     */
    private composingText = "";

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private main: MainController,
    ) {
        this.registerType();
        this.registerReplacePrevChar();
        this.disposables.push(commands.registerCommand("vscode-neovim.send", this.onSendCommand));
        this.disposables.push(commands.registerCommand("vscode-neovim.send-blocking", this.onSendBlockingCommand));
        this.disposables.push(commands.registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand));
        this.disposables.push(commands.registerCommand("vscode-neovim.enable", () => this.onEnableCommand("enable")));
        this.disposables.push(commands.registerCommand("vscode-neovim.disable", () => this.onEnableCommand("disable")));
        this.disposables.push(commands.registerCommand("vscode-neovim.toggle", () => this.onEnableCommand("toggle")));
        this.disposables.push(
            commands.registerCommand("vscode-neovim.compositeEscape1", (key: string) =>
                this.handleCompositeEscapeFirstKey(key),
            ),
        );
        this.disposables.push(
            commands.registerCommand("vscode-neovim.compositeEscape2", (key: string) =>
                this.handleCompositeEscapeSecondKey(key),
            ),
        );
        this.disposables.push(commands.registerCommand("compositionStart", this.onCompositionStart));
        this.disposables.push(commands.registerCommand("compositionEnd", this.onCompositionEnd));
        this.main.modeManager.onModeChange(this.onModeChange);
    }

    public dispose(): void {
        this.typeHandlerDisposable?.dispose();
        this.replacePrevCharHandlerDisposable?.dispose();
        this.disposables.forEach((d) => d.dispose());
    }

    public registerType(): void {
        if (!this.typeHandlerDisposable) {
            this.logger.debug(`${LOG_PREFIX}: Enabling type handler`);
            this.typeHandlerDisposable = commands.registerTextEditorCommand("type", this.onVSCodeType);
        }
    }

    public disposeType(): void {
        if (this.typeHandlerDisposable) {
            this.logger.debug(`${LOG_PREFIX}: Disabling type handler`);
            this.typeHandlerDisposable.dispose();
            this.typeHandlerDisposable = undefined;
        }
    }

    public registerReplacePrevChar(): void {
        if (!this.replacePrevCharHandlerDisposable) {
            this.logger.debug(`${LOG_PREFIX}: Enabling replacePrevChar handler`);
            this.replacePrevCharHandlerDisposable = commands.registerCommand(
                "replacePreviousChar",
                this.onReplacePreviousChar,
            );
        }
    }

    public disposeReplacePrevChar(): void {
        if (this.replacePrevCharHandlerDisposable) {
            this.logger.debug(`${LOG_PREFIX}: Disabling replacePrevChar handler`);
            this.replacePrevCharHandlerDisposable.dispose();
            this.replacePrevCharHandlerDisposable = undefined;
        }
    }

    private onModeChange = (): void => {
        if (
            this.main.modeManager.isInsertMode &&
            this.typeHandlerDisposable &&
            !this.main.modeManager.isRecordingInInsertMode
        ) {
            this.pendingKeysAfterEnter = "";
            const editor = window.activeTextEditor;
            if (editor && this.main.changeManager.hasDocumentChangeCompletionLock(editor.document)) {
                this.isEnteringInsertMode = true;
                this.logger.debug(
                    `${LOG_PREFIX}: Waiting for document completion operation before disposing type handler`,
                );
                this.main.changeManager.getDocumentChangeCompletionLock(editor.document)?.then(() => {
                    this.isEnteringInsertMode = false;
                    if (this.main.modeManager.isInsertMode) {
                        this.disposeType();
                        this.disposeReplacePrevChar();
                    }
                    if (this.pendingKeysAfterEnter) {
                        commands.executeCommand(this.main.modeManager.isInsertMode ? "default:type" : "type", {
                            text: this.pendingKeysAfterEnter,
                        });
                        this.pendingKeysAfterEnter = "";
                    }
                });
            } else {
                this.disposeType();
                this.disposeReplacePrevChar();
            }
        } else if (!this.main.modeManager.isInsertMode) {
            this.isEnteringInsertMode = false;
            this.isExitingInsertMode = false;
            this.registerType();
            this.registerReplacePrevChar();
        }
    };

    private onVSCodeType = async (_editor: TextEditor, edit: TextEditorEdit, type: { text: string }): Promise<void> => {
        if (this.isEnteringInsertMode) {
            this.pendingKeysAfterEnter += type.text;
        } else if (this.isExitingInsertMode) {
            this.pendingKeysAfterExit += type.text;
        } else if (this.isInComposition) {
            this.composingText += type.text;
        } else if (this.main.modeManager.isInsertMode && !this.main.modeManager.isRecordingInInsertMode) {
            if ((await this.client.mode).blocking) {
                this.client.input(normalizeInputString(type.text, !this.main.modeManager.isRecordingInInsertMode));
            } else {
                this.disposeType();
                this.disposeReplacePrevChar();
                commands.executeCommand("default:type", { text: type.text });
            }
        } else {
            this.client.input(normalizeInputString(type.text, !this.main.modeManager.isRecordingInInsertMode));
        }
    };

    private onSendCommand = async (key: string): Promise<void> => {
        this.logger.debug(`${LOG_PREFIX}: Send for: ${key}`);
        this.main.cursorManager.wantInsertCursorUpdate = true;
        if (
            (this.main.modeManager.isInsertMode || this.main.modeManager.isReplaceMode) &&
            !(await this.client.mode).blocking
        ) {
            this.logger.debug(`${LOG_PREFIX}: Syncing buffers with neovim (${key})`);
            await this.main.changeManager.documentChangeLock.waitForUnlock();
            if (window.activeTextEditor)
                await this.main.cursorManager.updateNeovimCursorPosition(window.activeTextEditor, undefined);
            await this.main.changeManager.syncDotRepeatWithNeovim();
            const keys = normalizeInputString(this.pendingKeysAfterExit);
            this.logger.debug(`${LOG_PREFIX}: Pending keys sent with ${key}: ${keys}`);
            this.pendingKeysAfterExit = "";
            await this.client.input(`${key}${keys}`);
        } else {
            this.isExitingInsertMode = false;
            await this.client.input(`${key}`);
        }
    };

    private onSendBlockingCommand = async (key: string): Promise<void> => {
        this.registerType();
        this.registerReplacePrevChar();
        await this.onSendCommand(key);
    };

    public onEnableCommand = (mode: "enable" | "disable" | "toggle"): void => {
        switch (mode) {
            case "enable":
                this.neovimEnable = true;
                break;
            case "disable":
                this.neovimEnable = false;
                break;
            case "toggle":
                this.neovimEnable = !this.neovimEnable;
                break;
        }

        if (this.neovimEnable) {
            this.client.command("stopinsert");
        } else {
            this.client.command("startinsert");
        }
    };

    private onEscapeKeyCommand = async (key = "<Esc>"): Promise<void> => {
        // rebind early to store fast pressed keys which may happen between sending changes to neovim and exiting insert mode
        // see https://github.com/asvetliakov/vscode-neovim/issues/324
        if (this.neovimEnable || key !== "<Esc>") {
            this.isExitingInsertMode = true;
            await this.onSendBlockingCommand(key);
        }
    };

    private handleCompositeEscapeFirstKey = async (key: string): Promise<void> => {
        const now = new Date().getTime();
        if (this.compositeEscapeFirstPressTimestamp && now - this.compositeEscapeFirstPressTimestamp <= 200) {
            this.compositeEscapeFirstPressTimestamp = undefined;
            await commands.executeCommand("deleteLeft");
            await this.onEscapeKeyCommand();
        } else {
            this.compositeEscapeFirstPressTimestamp = now;
            await commands.executeCommand("type", { text: key });
        }
    };

    private handleCompositeEscapeSecondKey = async (key: string): Promise<void> => {
        const now = new Date().getTime();
        if (this.compositeEscapeFirstPressTimestamp && now - this.compositeEscapeFirstPressTimestamp <= 200) {
            this.compositeEscapeFirstPressTimestamp = undefined;
            await commands.executeCommand("deleteLeft");
            await this.onEscapeKeyCommand();
        } else {
            await commands.executeCommand("type", { text: key });
        }
    };

    private onReplacePreviousChar = (type: { text: string; replaceCharCnt: number }): void => {
        if (this.isInComposition)
            this.composingText =
                this.composingText.substring(0, this.composingText.length - type.replaceCharCnt) + type.text;
    };

    private onCompositionStart = (): void => {
        this.isInComposition = true;
    };

    private onCompositionEnd = (): void => {
        this.isInComposition = false;

        if (!this.main.modeManager.isInsertMode)
            this.client.input(normalizeInputString(this.composingText, !this.main.modeManager.isRecordingInInsertMode));

        this.composingText = "";
    };
}
