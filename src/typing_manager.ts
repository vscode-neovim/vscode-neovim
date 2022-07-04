import { NeovimClient } from "neovim";
import { commands, Disposable, TextEditor, TextEditorEdit, window } from "vscode";

import { DocumentChangeManager } from "./document_change_manager";
import { Logger } from "./logger";
import { ModeManager } from "./mode_manager";
import { normalizeInputString } from "./utils";

const LOG_PREFIX = "TypingManager";

export class TypingManager implements Disposable {
    private disposables: Disposable[] = [];
    /**
     * Separate "type" command disposable since we init/dispose it often
     */
    private typeHandlerDisposable?: Disposable;
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

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private modeManager: ModeManager,
        private changeManager: DocumentChangeManager,
    ) {
        this.registerType();
        this.disposables.push(
            commands.registerCommand("vscode-neovim.sync-send", (key) => this.onSyncSendCommand(key)),
        );
        this.disposables.push(commands.registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand));
        this.disposables.push(commands.registerCommand("vscode-neovim.paste-register", this.onPasteRegisterCommand));
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
        this.modeManager.onModeChange(this.onModeChange);
    }

    public dispose(): void {
        this.typeHandlerDisposable?.dispose();
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

    private onModeChange = (): void => {
        if (this.modeManager.isInsertMode && this.typeHandlerDisposable && !this.modeManager.isRecordingInInsertMode) {
            this.pendingKeysAfterEnter = "";
            const editor = window.activeTextEditor;
            if (editor && this.changeManager.hasDocumentChangeCompletionLock(editor.document)) {
                this.isEnteringInsertMode = true;
                this.logger.debug(
                    `${LOG_PREFIX}: Waiting for document completion operation before disposing type handler`,
                );
                this.changeManager.getDocumentChangeCompletionLock(editor.document)?.then(() => {
                    this.isEnteringInsertMode = false;
                    if (this.modeManager.isInsertMode) this.disposeType();
                    if (this.pendingKeysAfterEnter) {
                        commands.executeCommand(this.modeManager.isInsertMode ? "default:type" : "type", {
                            text: this.pendingKeysAfterEnter,
                        });
                        this.pendingKeysAfterEnter = "";
                    }
                });
            } else {
                this.disposeType();
            }
        } else if (!this.modeManager.isInsertMode) {
            this.isEnteringInsertMode = false;
            this.isExitingInsertMode = false;
            this.registerType();
        }
    };

    private onVSCodeType = async (_editor: TextEditor, edit: TextEditorEdit, type: { text: string }): Promise<void> => {
        if (this.isEnteringInsertMode) {
            this.pendingKeysAfterEnter += type.text;
        } else if (this.isExitingInsertMode) {
            this.pendingKeysAfterExit += type.text;
        } else if (this.modeManager.isInsertMode && !this.modeManager.isRecordingInInsertMode) {
            const mode = await this.client.mode;
            if (mode.blocking) {
                this.client.input(normalizeInputString(type.text, !this.modeManager.isRecordingInInsertMode));
            } else {
                this.disposeType();
                commands.executeCommand("default:type", { text: type.text });
            }
        } else {
            this.client.input(normalizeInputString(type.text, !this.modeManager.isRecordingInInsertMode));
        }
    };

    private onSyncSendCommand = async (key: string): Promise<void> => {
        this.logger.debug(`${LOG_PREFIX}: Sync and send for: ${key}`);
        if (this.modeManager.isInsertMode && !(await this.client.mode).blocking) {
            this.logger.debug(`${LOG_PREFIX}: Syncing buffers with neovim (${key})`);
            await this.changeManager.syncDocumentsWithNeovim();
            await this.changeManager.syncDotRepatWithNeovim();
        } else {
            this.isExitingInsertMode = false;
        }
        const keys = normalizeInputString(this.pendingKeysAfterExit);
        if (this.pendingKeysAfterExit !== "")
            this.logger.debug(`${LOG_PREFIX}: Pending keys sent with ${key}: ${keys}`);
        this.pendingKeysAfterExit = "";
        await this.client.input(`${key}${keys}`);
    };

    private onEscapeKeyCommand = async (key = "<Esc>"): Promise<void> => {
        // rebind early to store fast pressed keys which may happen between sending changes to neovim and exiting insert mode
        // see https://github.com/asvetliakov/vscode-neovim/issues/324
        this.registerType();
        this.isExitingInsertMode = true;
        await this.onSyncSendCommand(key);
    };

    private onPasteRegisterCommand = async (): Promise<void> => {
        this.registerType();
        await this.onSyncSendCommand("<C-r>");
    };

    private handleCompositeEscapeFirstKey = async (key: string): Promise<void> => {
        const now = new Date().getTime();
        if (this.compositeEscapeFirstPressTimestamp && now - this.compositeEscapeFirstPressTimestamp <= 200) {
            // jj
            this.compositeEscapeFirstPressTimestamp = undefined;
            await commands.executeCommand("deleteLeft");
            await this.onEscapeKeyCommand();
        } else {
            this.compositeEscapeFirstPressTimestamp = now;
            // insert character
            await commands.executeCommand("default:type", { text: key });
        }
    };

    private handleCompositeEscapeSecondKey = async (key: string): Promise<void> => {
        const now = new Date().getTime();
        if (this.compositeEscapeFirstPressTimestamp && now - this.compositeEscapeFirstPressTimestamp <= 200) {
            this.compositeEscapeFirstPressTimestamp = undefined;
            await commands.executeCommand("deleteLeft");
            await this.onEscapeKeyCommand();
        } else {
            await commands.executeCommand("default:type", { text: key });
        }
    };
}
