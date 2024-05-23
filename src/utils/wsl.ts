import { execSync } from "child_process";

import { config } from "../config";

/**
 * Translate from a Windows path to a WSL path
 * @param path Windows path
 * @returns WSL path
 */
export const wslpath = (path: string) => {
    // execSync returns a newline character at the end
    const distro = config.wslDistribution.length ? `-d ${config.wslDistribution}` : "";
    return execSync(`C:\\Windows\\system32\\wsl.exe ${distro} wslpath '${path}'`).toString().trim();
};
