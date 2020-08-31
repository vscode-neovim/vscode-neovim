import { commands, Disposable, Selection, window } from "vscode";

import { Logger } from "./logger";
import { NeovimCommandProcessable, NeovimRangeCommandProcessable } from "./neovim_events_processable";

export class CustomCommandsManager implements Disposable, NeovimCommandProcessable, NeovimRangeCommandProcessable {
    private disposables: Disposable[] = [];

    public constructor(private logger: Logger) {}

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public async handleVSCodeCommand(command: string, args: unknown[]): Promise<unknown> {
        const res = await commands.executeCommand(command, ...args);
        return res;
    }

    /**
     * Produce vscode selection and execute command
     * @param command VSCode command to execute
     * @param startLine Start line to select. 1based
     * @param endLine End line to select. 1based
     * @param startPos Start pos to select. 1based. If 0 then whole line will be selected
     * @param endPos End pos to select, 1based. If you then whole line will be selected
     * @param leaveSelection When true won't clear vscode selection after running the command
     * @param args Additional args
     */
    public async handleVSCodeRangeCommand(
        command: string,
        startLine: number,
        endLine: number,
        startPos: number,
        endPos: number,
        leaveSelection: boolean,
        args: unknown[],
    ): Promise<unknown> {
        const e = window.activeTextEditor;
        if (e) {
            // vi<obj> includes end of line from start pos. This is not very useful, so let's check and remove it
            // vi<obj> always select from top to bottom
            if (endLine > startLine) {
                try {
                    const lineDef = e.document.lineAt(startLine - 1);
                    if (startPos > 0 && startPos - 1 >= lineDef.range.end.character) {
                        startLine++;
                        startPos = 0;
                    }
                } catch {
                    // ignore
                }
            }
            const prevSelections = [...e.selections];
            // startLine is visual start
            if (startLine > endLine) {
                e.selections = [
                    new Selection(
                        startLine - 1,
                        startPos > 0 ? startPos - 1 : 9999999,
                        endLine - 1,
                        endPos > 0 ? endPos - 1 : 0,
                    ),
                ];
            } else {
                e.selections = [
                    new Selection(
                        startLine - 1,
                        startPos > 0 ? startPos - 1 : 0,
                        endLine - 1,
                        endPos > 0 ? endPos - 1 : 9999999,
                    ),
                ];
            }
            const res = await commands.executeCommand(command, ...args);
            if (!leaveSelection) {
                e.selections = prevSelections;
            }
            return res;
        }
    }
}
