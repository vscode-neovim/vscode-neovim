import { commands, Disposable, TextEditor, TextEditorEdit, window } from "vscode";

import { createLogger } from "./logger";
import { MainController } from "./main_controller";
import { disposeAll, normalizeInputString } from "./utils";

const logger = createLogger("TypingManager");

export class TypingManager implements Disposable {
    private disposables: Disposable[] = [];
    /**
     * Flag indicating that we're going to exit insert mode and sync buffers into neovim
     */
    private isExitingInsertMode = false;
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

    private takeOverVSCodeInput = false;

    private get client() {
        return this.main.client;
    }

    public constructor(private main: MainController) {
        const warnOnEmptyKey = (method: (key: string) => Promise<void>): typeof method => {
            return (key: string) => {
                if (key) {
                    return method.apply(this, [key]);
                } else {
                    const link =
                        "command:workbench.action.openGlobalKeybindings?" +
                        encodeURIComponent('["vscode-neovim.send"]');
                    window.showErrorMessage(
                        `No args provided to vscode-neovim.send. Please check your [keybinds](${link}) ` +
                            "to ensure that all send commands include the args parameter.",
                    );
                    return Promise.resolve();
                }
            };
        };

        this.takeOverVSCodeInput = true;
        this.disposables.push(
            commands.registerTextEditorCommand("type", this.onVSCodeType),
            commands.registerCommand("replacePreviousChar", this.onReplacePreviousChar),
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const registerCommand = (cmd: string, cb: (...args: any[]) => any) => {
            this.disposables.push(commands.registerCommand(cmd, cb, this));
        };
        registerCommand("vscode-neovim.send", warnOnEmptyKey(this.onSendCommand));
        registerCommand("vscode-neovim.send-blocking", warnOnEmptyKey(this.onSendBlockingCommand));
        registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand);
        registerCommand("vscode-neovim.compositeEscape1", warnOnEmptyKey(this.handleCompositeEscapeFirstKey));
        registerCommand("vscode-neovim.compositeEscape2", warnOnEmptyKey(this.handleCompositeEscapeSecondKey));
        registerCommand("compositionStart", this.onCompositionStart);
        registerCommand("compositionEnd", this.onCompositionEnd);
        this.main.modeManager.onModeChange(this.onModeChange);
    }

    private onModeChange = async (): Promise<void> => {
        if (
            this.main.modeManager.isInsertMode &&
            this.takeOverVSCodeInput &&
            !this.main.modeManager.isRecordingInInsertMode
        ) {
            const editor = window.activeTextEditor;
            const documentPromise = editor && this.main.changeManager.getDocumentChangeCompletionLock(editor.document);
            if (documentPromise) {
                logger.debug(`Waiting for cursor completion operation before disposing type handler`);
                this.pendingKeysAfterEnter = "";
                this.isEnteringInsertMode = true;
                documentPromise.then(async () => {
                    await this.main.cursorManager.waitForCursorUpdate(editor);
                    if (this.main.modeManager.isInsertMode) {
                        this.takeOverVSCodeInput = false;
                    }
                    if (this.pendingKeysAfterEnter) {
                        logger.debug(
                            `Replaying pending keys after entering insert mode: ${this.pendingKeysAfterEnter}`,
                        );
                        await commands.executeCommand(this.main.modeManager.isInsertMode ? "default:type" : "type", {
                            text: this.pendingKeysAfterEnter,
                        });
                        this.pendingKeysAfterEnter = "";
                    }
                    this.isEnteringInsertMode = false;
                });
            } else {
                this.takeOverVSCodeInput = false;
            }
        } else if (!this.main.modeManager.isInsertMode) {
            this.isEnteringInsertMode = false;
            this.isExitingInsertMode = false;
            this.takeOverVSCodeInput = true;
        }
    };

    private onVSCodeType = async (
        _editor: TextEditor,
        _edit: TextEditorEdit,
        type: { text: string },
    ): Promise<void> => {
        if (!this.takeOverVSCodeInput) {
            return commands.executeCommand("default:type", { ...type });
        }
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
                this.takeOverVSCodeInput = false;
                commands.executeCommand("default:type", { ...type });
            }
        } else {
            this.client.input(normalizeInputString(type.text, !this.main.modeManager.isRecordingInInsertMode));
        }
    };

    private onSendCommand = async (key: string): Promise<void> => {
        logger.debug(`Send for: ${key}`);
        this.main.cursorManager.wantInsertCursorUpdate = true;
        if (this.main.modeManager.isInsertMode && !(await this.client.mode).blocking) {
            logger.debug(`Syncing buffers with neovim (${key})`);
            await this.main.changeManager.documentChangeLock.waitForUnlock();
            if (window.activeTextEditor)
                await this.main.cursorManager.updateNeovimCursorPosition(
                    window.activeTextEditor,
                    window.activeTextEditor.selection.active,
                    false,
                );
            await this.main.changeManager.syncDotRepeatWithNeovim();
            const keys = normalizeInputString(this.pendingKeysAfterExit);
            logger.debug(`Pending keys sent with ${key}: ${keys}`);
            this.pendingKeysAfterExit = "";
            await this.client.input(`${key}${keys}`);
        } else {
            this.isExitingInsertMode = false;
            await this.client.input(`${key}`);
        }
    };

    private onSendBlockingCommand = async (key: string): Promise<void> => {
        this.takeOverVSCodeInput = true;
        await this.onSendCommand(key);
    };

    private onEscapeKeyCommand = async (key = "<Esc>"): Promise<void> => {
        // rebind early to store fast pressed keys which may happen between sending changes to neovim and exiting insert mode
        // see https://github.com/asvetliakov/vscode-neovim/issues/324
        this.isExitingInsertMode = true;
        await this.onSendBlockingCommand(key);
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

    private onReplacePreviousChar = (type: { text: string; replaceCharCnt: number }) => {
        if (!this.takeOverVSCodeInput) {
            return commands.executeCommand("default:replacePreviousChar", { ...type });
        }
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

    public dispose() {
        disposeAll(this.disposables);
    }
}
