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
        this.typeHandlerDisposable = commands.registerTextEditorCommand("type", this.onVSCodeType);
        this.disposables.push(commands.registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand));
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
                    if (this.typeHandlerDisposable) {
                        this.logger.debug(`${LOG_PREFIX}: Waiting done, disposing type handler`);
                        this.typeHandlerDisposable.dispose();
                        this.typeHandlerDisposable = undefined;
                        if (this.pendingKeysAfterEnter) {
                            commands.executeCommand("default:type", { text: this.pendingKeysAfterEnter });
                            this.pendingKeysAfterEnter = "";
                        }
                    }
                });
            } else {
                this.logger.debug(`${LOG_PREFIX}: Disposing type handler`);
                this.typeHandlerDisposable.dispose();
                this.typeHandlerDisposable = undefined;
            }
        } else if (!this.modeManager.isInsertMode) {
            this.isEnteringInsertMode = false;
            this.isExitingInsertMode = false;
            if (!this.typeHandlerDisposable) {
                this.logger.debug(`${LOG_PREFIX}: Enabling type handler`);
                this.typeHandlerDisposable = commands.registerTextEditorCommand("type", this.onVSCodeType);
            }
        }
    };

    private onVSCodeType = (_editor: TextEditor, edit: TextEditorEdit, type: { text: string }): void => {
        if (!this.modeManager.isInsertMode || this.modeManager.isRecordingInInsertMode || this.isEnteringInsertMode) {
            if (this.isEnteringInsertMode) {
                this.pendingKeysAfterEnter += type.text;
            } else {
                this.client.input(normalizeInputString(type.text, !this.modeManager.isRecordingInInsertMode));
            }
        } else if (this.isExitingInsertMode) {
            this.pendingKeysAfterExit += type.text;
        } else {
            commands.executeCommand("default:type", { text: type.text });
        }
    };

    private onEscapeKeyCommand = async (): Promise<void> => {
        this.logger.debug(`${LOG_PREFIX}: Escape key`);
        if (this.modeManager.isInsertMode) {
            this.logger.debug(`${LOG_PREFIX}: Syncing buffers with neovim`);
            this.isExitingInsertMode = true;
            // rebind early to store fast pressed keys which may happen between sending changes to neovim and exiting insert mode
            // see https://github.com/asvetliakov/vscode-neovim/issues/324
            if (!this.typeHandlerDisposable) {
                this.typeHandlerDisposable = commands.registerTextEditorCommand("type", this.onVSCodeType);
            }
            // this.leaveMultipleCursorsForVisualMode = false;
            await this.changeManager.syncDocumentsWithNeovim();
            await this.changeManager.syncDotRepatWithNeovim();
        }
        const keys = normalizeInputString(this.pendingKeysAfterExit);
        this.logger.debug(`${LOG_PREFIX}: Pending keys sent with <Esc>: ${keys}`);
        this.pendingKeysAfterExit = "";
        await this.client.input(`<Esc>${keys}`);
        // const buf = await this.client.buffer;
        // const lines = await buf.lines;
        // console.log("====LINES====");
        // console.log(lines.length);
        // console.log(lines.join("\n"));
        // console.log("====END====");
    };

    private handleCompositeEscapeFirstKey = async (key: string): Promise<void> => {
        const now = new Date().getTime();
        if (this.compositeEscapeFirstPressTimestamp && now - this.compositeEscapeFirstPressTimestamp <= 200) {
            // jj
            this.compositeEscapeFirstPressTimestamp = undefined;
            await commands.executeCommand("deleteLeft");
            this.onEscapeKeyCommand();
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
            this.onEscapeKeyCommand();
        } else {
            await commands.executeCommand("default:type", { text: key });
        }
    };
}
