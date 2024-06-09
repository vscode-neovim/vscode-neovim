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
    void args;

    // We can tell statically this will return a Promise<any>, and this is user provided code,
    // so, we can't know its type.
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const func: () => Promise<any> = eval("async () => {" + code + "}");
    const result = await func();

    let data: string | undefined;
    try {
        data = JSON.stringify(result);
    } catch (e) {
        throw new Error(`Return value of eval not JSON serializable: ${e}`);
    }

    return data ? JSON.parse(data) : data;
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
}
