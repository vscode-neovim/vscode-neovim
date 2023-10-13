import { commands, Disposable, TextEditorLineNumbersStyle, window } from "vscode";

import { eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { NeovimCommandProcessable } from "./neovim_events_processable";

export class CustomCommandsManager implements Disposable, NeovimCommandProcessable {
    private disposables: Disposable[] = [];

    public constructor(private main: MainController) {
        eventBus.on(
            "change-number",
            ([winId, style]) => {
                const editor = this.main.bufferManager.getEditorFromWinId(winId);
                if (editor) {
                    editor.options.lineNumbers =
                        style === "off"
                            ? TextEditorLineNumbersStyle.Off
                            : style === "on"
                            ? TextEditorLineNumbersStyle.On
                            : TextEditorLineNumbersStyle.Relative;
                }
            },
            null,
            this.disposables,
        );
    }

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
}
