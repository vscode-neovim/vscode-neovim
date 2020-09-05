import { commands, Disposable } from "vscode";

import { Logger } from "./logger";
import { NeovimCommandProcessable } from "./neovim_events_processable";

export class CustomCommandsManager implements Disposable, NeovimCommandProcessable {
    private disposables: Disposable[] = [];

    public constructor(private logger: Logger) {}

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public async handleVSCodeCommand(command: string, args: unknown[]): Promise<unknown> {
        const res = await commands.executeCommand(command, ...args);
        return res;
    }
}
