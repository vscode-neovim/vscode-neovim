local M = {}

M.is_visual_mode = function()
    mode = vim.api.nvim_get_mode().mode
    return mode == "v" or mode == "V" or mode == '\x16'
end

M.get_char_at = function(line, byte_col)
    local line_str = vim.fn.getline(line)
    local char_idx = vim.fn.charidx(line_str, (byte_col - 1))
    local char_nr = vim.fn.strgetchar(line_str, (char_idx))
    if (char_nr ~= -1) then
        return vim.fn.nr2char(char_nr)
    else
        return nil
    end
end

return M
