import _vscode from "vscode";

import { createLogger } from "./logger";

const vscode = _vscode;
const logger = createLogger("eval");

_use_variables([vscode, logger]);

/**
 * Execute javascript code passed from lua in an async function context
 *
 * - the variable `vscode` can be used to access the VSCode API
 * - the variable `args` can be used to access the arguments passed from lua
 *
 * @param code the code to evaluate
 * @param args arguments passed from lua
 *
 * @returns the result of evaluating the code, serialized to send back to lua
 */
export async function eval_for_client(code: string, args: any): Promise<any> {
    const result = await eval("async () => {" + code + "}")();

    _use_variables([args]);

    const value_type = typeof result;
    if (value_type === "object") {
        return String(result);
    } else if (value_type === "function") {
        return `[Function: ${result.name}]`;
    } else {
        return result;
    }
}

/**
 * Re-assure static analysis tools that the given variables are used.
 * This prevents them from being removed at build time.
 *
 * @param variables list of variables to mark as used.
 */
function _use_variables(variables: any[]) {
    if (variables.length === 0) {
        return;
    }
}
