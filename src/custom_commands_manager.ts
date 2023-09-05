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
            case "option-set": {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const [winId, name, data] = args as [
                    number,
                    string,
                    {
                        option_type: string;
                        option_new: string;
                        option_oldlocal: string;
                        option_oldglobal: string;
                        option_old: string;
                    },
                ];
                const editor = this.main.bufferManager.getEditorFromWinId(winId);
                if (!editor) {
                    return;
                }
                switch (name) {
                    case "number":
                        console.log(+data.option_new);
                        if (+data.option_new) {
                            editor.options.lineNumbers = TextEditorLineNumbersStyle.On;
                        } else {
                            editor.options.lineNumbers = TextEditorLineNumbersStyle.Off;
                        }
                        break;
                    case "relativenumber":
                        if (+data.option_new) {
                            editor.options.lineNumbers = TextEditorLineNumbersStyle.Relative;
                        } else {
                            editor.options.lineNumbers = TextEditorLineNumbersStyle.On; // most compatible option with nvim
                        }
                        break;
                    default:
                        return;
                }
                // only log if we actually set something
                this.logger.debug(`${LOG_PREFIX}: option ${name} set (${JSON.stringify(data)})`);
                break;
            }
        }
    }
}
