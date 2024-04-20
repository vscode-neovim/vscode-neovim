import { NeovimClient } from "neovim";

import { ILogger, LogLevel } from "../logger";

/**
 * Wrap nvim callAtomic and check for any errors in result
 * @param client
 * @param requests
 * @param logger
 * @param prefix
 */
export async function callAtomic(
    client: NeovimClient,
    requests: [string, unknown[]][],
    logger: ILogger,
): Promise<void> {
    // The type annotation in the Neovim node client seems to be wrong
    // (see https://neovim.io/doc/user/api.html for the correct type for nvim_call_atomic)
    const res = (await client.callAtomic(requests)) as unknown as [unknown[], [number, unknown, string] | null];
    // Should never reach here if neovim is behaving correctly
    if (!(res && Array.isArray(res) && Array.isArray(res[0]))) {
        logger.log(undefined, LogLevel.error, `Unexpected result from nvim_call_atomic`);
        return;
    }
    const returned_errors = res[1];
    if (returned_errors) {
        const [failing_call_idx, err_type, err_msg] = returned_errors;
        const call = requests[failing_call_idx];
        const requestName = call[0];
        const errMsg = `${requestName}: ${err_msg} (Error type: ${err_type})`;
        // TODO: Determine cause for errors for both of these requests
        if (requestName === "nvim_input" || requestName === "nvim_win_close") {
            logger.log(undefined, LogLevel.warn, errMsg);
        } else {
            logger.log(undefined, LogLevel.error, errMsg);
        }
    }
}
