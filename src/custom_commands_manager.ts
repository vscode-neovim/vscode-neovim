import { Disposable, TextEditorLineNumbersStyle } from "vscode";

import { eventBus } from "./eventBus";
import { MainController } from "./main_controller";

export class CustomCommandsManager implements Disposable {
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
}
