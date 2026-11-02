import { NeovimClient } from "neovim";
import { Position } from "vscode";

/**
 * Get the (0, 0)-indexed byte cursor of the current neovim window, if it shows the given buffer
 */
export async function getCurrentWinCursorInBuf(client: NeovimClient, bufId: number): Promise<Position | undefined> {
    const cursor = (await client.lua(
        `
        local buf = ...
        if vim.api.nvim_get_current_buf() == buf then
            return vim.api.nvim_win_get_cursor(0)
        end
        `,
        [bufId],
    )) as [number, number] | null;
    return cursor ? new Position(cursor[0] - 1, cursor[1]) : undefined;
}
