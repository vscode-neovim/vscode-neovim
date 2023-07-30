import { commands, Disposable, window } from "vscode";

import { Logger } from "./logger";
import { NeovimCommandProcessable } from "./neovim_events_processable";
import { MainController } from "./main_controller";

export class CustomCommandsManager implements Disposable, NeovimCommandProcessable {
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
}
