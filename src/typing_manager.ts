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

    public constructor(
        private logger: Logger,
        private client: NeovimClient,
        private modeManager: ModeManager,
        private changeManager: DocumentChangeManager,
    ) {
        this.typeHandlerDisposable = commands.registerTextEditorCommand("type", this.onVSCodeType);
        this.disposables.push(commands.registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand));
        this.modeManager.onModeChange(this.onModeChange);
    }

    public dispose(): void {
        this.typeHandlerDisposable?.dispose();
        this.disposables.forEach((d) => d.dispose());
    }

    private onModeChange = (): void => {
        if (!this.typeHandlerDisposable) {
            this.logger.debug(`${LOG_PREFIX}: Enabling type handler`);
            this.typeHandlerDisposable = commands.registerTextEditorCommand("type", this.onVSCodeType);
        }
    };

    private onVSCodeType = (_editor: TextEditor, edit: TextEditorEdit, type: { text: string }): void => {
        this.client.input(normalizeInputString(type.text, !this.modeManager.isRecordingInInsertMode));
    };

    private onEscapeKeyCommand = async (): Promise<void> => {
        await this.client.input("<Esc>");
    };
}
