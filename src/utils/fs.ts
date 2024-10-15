import { Uri, workspace } from "vscode";

/**
 * Check if a file exists. This is a wrapper around `workspace.fs.stat`
 */
export async function fileExists(uri: Uri): Promise<boolean> {
    try {
        await workspace.fs.stat(uri);
    } catch {
        return false;
    }
    return true;
}

/**
 * The `\\?\` prefix that opts a Win32 path out of normalization. Forward slashes are not
 * recognized inside such a path, so it must be left alone.
 */
const verbatimPrefix = "\\\\?\\";

/**
 * Rewrites a Windows path to use "/" separators. Both Win32 and Nvim accept "/", which works with Nvim features without
 * needing to escape "\" slashes.
 *
 * @param isWinPath `path` is a Windows path (as opposed to e.g. a WSL setting, which is a Linux path even on win32).
 */
export function toSlashes(path: string, isWinPath: boolean): string {
    if (!isWinPath || path.startsWith(verbatimPrefix)) {
        return path;
    }
    return path.replace(/\\/g, "/");
}
