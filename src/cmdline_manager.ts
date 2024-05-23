import { Disposable } from "vscode";

import { CommandLineController } from "./cmdline/cmdline_controller";
import { EventBusData, eventBus } from "./eventBus";
import { MainController } from "./main_controller";
import { disposeAll } from "./utils";

export class CommandLineManager implements Disposable {
    private disposables: Disposable[] = [];
    /**
     * Simple command line UI
     */
    private commandLine?: CommandLineController;

    public constructor(private main: MainController) {
        eventBus.on("redraw", this.handleRedraw, this, this.disposables);
    }

    public dispose() {
        this.commandLine?.dispose();
        disposeAll(this.disposables);
    }

    private handleRedraw({ name, args }: EventBusData<"redraw">) {
        switch (name) {
            case "cmdline_show": {
                const [content, _pos, firstc, prompt, _indent, _level] = args[0];
                const allContent = content.map(([, str]) => str).join("");
                if (!this.commandLine) {
                    this.commandLine = new CommandLineController(this.main.client);
                }
                this.commandLine.show(allContent, firstc, prompt);
                break;
            }
            case "popupmenu_show": {
                const [items, selected, _row, _col, _grid] = args[0];
                this.commandLine?.setCompletionItems(items, selected);
                break;
            }
            case "popupmenu_select": {
                this.commandLine?.setSelection(args[0][0]);
                break;
            }
            case "popupmenu_hide": {
                this.commandLine?.setCompletionItems([], -1);
                break;
            }
            case "cmdline_hide": {
                if (this.commandLine) {
                    this.commandLine.cancel(true);
                    this.commandLine.dispose();
                    this.commandLine = undefined;
                }
                break;
            }
        }
    }
}
