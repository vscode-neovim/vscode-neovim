require("vscode.defaults")
require("vscode.cursor")

local M = {}

---call from vscode to sync viewport with neovim
---@param win_handle number of current window
---@param vscode_topline number the top line of vscode visible range
---@param vscode_endline number the end line of vscode visible range
M.scroll_viewport = function(win_handle, vscode_topline, vscode_endline)
    local current_height = vim.api.nvim_win_get_height(win_handle)
    local new_height = vscode_endline - vscode_topline + 1
    -- resize height
    if current_height ~= new_height then
        vim.api.nvim_win_set_height(win_handle, new_height)
    end

    local top_line = vim.fn.line('w0')
    local diff = top_line - vscode_topline

    if diff ~= 0 and (vscode_topline > 0) then
        vim.api.nvim_win_call(win_handle, function()
            vim.fn.winrestview({
                topline = vscode_topline
            })
        end)
    end
end

_G.vscode = M
return M
