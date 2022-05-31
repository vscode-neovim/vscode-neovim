local M = {}

---call from vscode to sync viewport with neovim
---@param vscode_topline number the top line of vscode visible range
---@param vscode_endline number the end line of vscode visible range
M.scroll_viewport = function(vscode_topline, vscode_endline)
    local current_height = vim.api.nvim_win_get_height(0)
    local new_height = vscode_endline - vscode_topline +1
    -- resize height
    if current_height ~= new_height then
        vim.api.nvim_win_set_height(0, new_height)
    end

    local top_line = vim.fn.line('w0')
    local diff = top_line - vscode_topline

    if diff ~= 0 and (vscode_topline > 0) then
        vim.fn.winrestview({
            topline = vscode_topline
        })
    end
end

_G.vscode = M
return M
