import _vscode from "vscode";

import { createLogger } from "./logger";

const vscode = _vscode;
const logger = createLogger("eval");

// Ensure that the globals are 'used' so that they are not removed at build time
// and linters do not complain about them.
void vscode;
void logger;

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

    void args;

    const value_type = typeof result;
    if (value_type === "object") {
        return String(result);
    } else if (value_type === "function") {
        return `[Function: ${result.name}]`;
    } else {
        return result;
    }
}
