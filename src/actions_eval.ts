/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */

import * as _vscode from "vscode";

import { createLogger } from "./logger";

// @ts-ignore
const logger = createLogger("eval");

// for some reason, the name used in the import statement is not always visible to the code being run with eval()
// but global variables/constants are always visible.
// @ts-ignore
const vscode = _vscode;

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

    const value_type = typeof result;
    if (value_type === "object") {
        return String(result);
    } else if (value_type === "function") {
        return `[Function: ${result.name}]`;
    } else {
        return result;
    }
}
