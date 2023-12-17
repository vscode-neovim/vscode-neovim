import { NeovimClient } from "neovim";
import { VimValue } from "neovim/lib/types/VimValue";
import vscode, { ConfigurationTarget, Disposable, Range, commands, window, workspace } from "vscode";

import { disposeAll, rangesToSelections } from "./utils";

function getActionName(action: string) {
    return `neovim:${action}`;
}

class ActionManager implements Disposable {
    private disposables: Disposable[] = [];
    private actions: string[] = [];
    private client!: NeovimClient;

    init() {
        this.initActions();
        this.initHooks();
    }

    dispose() {
        this.actions = [];
        disposeAll(this.disposables);
    }

    /**
     * Add a new action
     * @param action The action string.
     * @param callback The callback function to be executed for the action.
     * @throws Error if the action already exists.
     */
    add(action: string, callback: (...args: any[]) => any) {
        if (this.actions.includes(action)) {
            throw new Error(`Action "${action}" already exist`);
        }
        this.actions.push(action);
        this.disposables.push(commands.registerCommand(getActionName(action), callback));
    }

    /**
     * Run the specified action with optional arguments.
     * @param action The action name.
     * @param args Optional arguments for the action callback.
     * @return A Promise that resolves to the result of the action callback.
     */
    async run(action: string, ...args: any[]): Promise<any> {
        const command = this.actions.includes(action) ? getActionName(action) : action;
        return commands.executeCommand(command, ...args);
    }

    // There is no suitable place to define this method.
    // Although it has nothing to do with Action, it is defined in actions for convenience.
    /**
     * Fire nvim event(hook)
     * @param event event name
     * @param args arguments for the event
     */
    public fireNvimEvent(event: string, ...args: VimValue[]): void {
        this.client.executeLua('require"vscode-neovim.api".fire_event(...)', [event, ...args]);
    }

    /**
     * Execute a function from the Lua module `vscode-neovim.internal`.
     * @param fname the internal function name
     * @param args arguments
     */
    public async lua<T = any>(fname: string, ...args: VimValue[]): Promise<T> {
        return this.client.lua(`return require"vscode-neovim.internal".${fname}(...)`, args) as Promise<T>;
    }

    private initActions() {
        // testing actions
        this.add("_ping", () => "pong");
        this.add("_wait", async (ms = 1000) => {
            await new Promise((resolve) => setTimeout(resolve, ms));
            return "ok";
        });
        this.add("has_config", (names: string | string[]): boolean | boolean[] => {
            const config = workspace.getConfiguration();
            if (Array.isArray(names)) {
                return names.map((name) => config.has(name));
            } else {
                return config.has(names);
            }
        });
        this.add("get_config", (names: string | string[]) => {
            const config = workspace.getConfiguration();
            if (Array.isArray(names)) {
                return names.map((name) => config.get(name));
            } else {
                return config.get(names);
            }
        });
        this.add("update_config", async (names: string | string[], values: any, target?: "global" | "workspace") => {
            const config = workspace.getConfiguration();
            let targetConfig = null;
            if (target) {
                targetConfig = target === "global" ? ConfigurationTarget.Global : ConfigurationTarget.Workspace;
            }
            if (!Array.isArray(names)) {
                names = [names];
                values = [values];
            }
            for (const [idx, name] of names.entries()) {
                await config.update(name, values[idx], targetConfig);
            }
        });
        this.add("notify", (msg: string, level: "info" | "warn" | "error") => {
            switch (level) {
                case "warn": {
                    window.showWarningMessage(msg);
                    break;
                }
                case "error": {
                    window.showErrorMessage(msg);
                    break;
                }
                default: {
                    window.showInformationMessage(msg);
                    break;
                }
            }
        });
        this.add("start-multiple-cursors", (ranges: Range[]) => {
            const editor = window.activeTextEditor;
            if (editor && ranges.length) {
                editor.selections = rangesToSelections(ranges, editor.document);
            }
        });
        this.add("clipboard_read", () => vscode.env.clipboard.readText());
        this.add("clipboard_write", (text: string) => vscode.env.clipboard.writeText(text));
        this.add("ui_select", (args: { items: vscode.QuickPickItem[]; opts: vscode.QuickPickOptions }) => {
            return vscode.window.showQuickPick(args.items, args.opts);
        });
        this.add("ui_input", (args: { opts: vscode.InputBoxOptions }) => {
            return vscode.window.showInputBox(args.opts);
        });
    }

    private initHooks() {
        this.disposables.push(
            window.onDidChangeWindowState((e) =>
                this.client.command(`doautocmd ${e.focused ? "FocusGained" : "FocusLost"}`),
            ),
        );
    }
}

export default new ActionManager();
