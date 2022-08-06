local M = {}

---call from vscode to sync viewport with neovim
---@param win_handle number of current window
---@param vscode_topline number the top line of vscode visible range
---@param vscode_endline number the end line of vscode visible range
M.scroll_viewport = function(win_handle, visible_ranges)
    local cmds = {}

    local new_height = 0
    local fold_start = -1
    for _, visible_range in ipairs(visible_ranges) do
        local top_line = visible_range[1]
        local end_line = visible_range[2]
        print(top_line, '-', end_line, ',')
        if fold_start >= 0 then
            table.insert(cmds, ('%d,%d:fold'):format(fold_start, top_line - 1))
        end
        new_height = new_height + end_line - top_line + 1
        fold_start = end_line
    end

    table.insert(cmds, 'setl foldmethod=manual')
    table.insert(cmds, 'setl foldenable')
    local winView = vim.fn.winsaveview()
    vim.cmd('norm! zE')
    vim.fn.winrestview(winView)
    vim.cmd(table.concat(cmds, '|'))

    local current_height = vim.api.nvim_win_get_height(win_handle)
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
