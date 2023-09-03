import { commands, Disposable, window } from "vscode";

import { Logger } from "./logger";
import { MainController } from "./main_controller";
import { NeovimCommandProcessable } from "./neovim_events_processable";
import { wait } from "./utils";

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
        // Give some time to other possible events  to weak up
        // 10ms basically has no side effects, even `cursorMove` which may be called frequently
        await wait(10);
        await this.main.cursorManager.waitForCursorUpdate(editor);
        return commands.executeCommand(command, ...args);
    }
}
