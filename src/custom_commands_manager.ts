import { commands, Disposable, TextEditorLineNumbersStyle, window } from "vscode";

import { Logger } from "./logger";
import { NeovimCommandProcessable, NeovimExtensionRequestProcessable } from "./neovim_events_processable";
import { MainController } from "./main_controller";

const LOG_PREFIX = "CustomCommandsManager";

export class CustomCommandsManager implements Disposable, NeovimCommandProcessable, NeovimExtensionRequestProcessable {
    private disposables: Disposable[] = [];

    public constructor(
        private logger: Logger,
        private main: MainController,
    ) {}

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public async handleVSCodeCommand(command: string, args: unknown[]): Promise<unknown> {
        const editor = window.activeTextEditor;
        if (!editor) return;
        await this.main.cursorManager.waitForCursorUpdate(editor);
        const res = await commands.executeCommand(command, ...args);
        return res;
    }

    public async handleExtensionRequest(name: string, args: unknown[]): Promise<void> {
        switch (name) {
            case "change-number": {
                const [winId, style] = args as [number, "off" | "on" | "relative"];
                const editor = this.main.bufferManager.getEditorFromWinId(winId);
                if (editor) {
                    editor.options.lineNumbers =
                        style === "off"
                            ? TextEditorLineNumbersStyle.Off
                            : style === "on"
                            ? TextEditorLineNumbersStyle.On
                            : TextEditorLineNumbersStyle.Relative;
                }
                break;
            }
        }
    }
}
