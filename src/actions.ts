import { ConfigurationTarget, Disposable, commands, workspace } from "vscode";

function getActionName(action: string) {
    return `neovim-action.${action}`;
}

class ActionManager implements Disposable {
    private disposables: Disposable[] = [];
    private actions: string[] = [];

    constructor() {
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
        this.add("update_config", async (names: string | string[], value: any, target?: "global" | "workspace") => {
            const config = workspace.getConfiguration();
            let targetConfig = null;
            if (target) targetConfig = target === "global" ? ConfigurationTarget.Global : ConfigurationTarget.Workspace;
            if (Array.isArray(names)) {
                for (const name of names) {
                    await config.update(name, value, targetConfig);
                }
            } else {
                await config.update(names, value);
            }
        });
    }

    dispose() {
        this.disposables.forEach((d) => d.dispose());
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
}

export default new ActionManager();