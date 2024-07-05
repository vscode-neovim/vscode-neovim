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
