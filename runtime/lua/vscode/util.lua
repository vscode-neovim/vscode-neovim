local M = {}

local fn, api = vim.fn, vim.api

function M.is_visual_mode()
  local mode = api.nvim_get_mode().mode
  return mode == "v" or mode == "V" or mode == "\x16"
end

function M.get_char_at(line, byte_col, buf)
  if not buf or buf == 0 then
    buf = api.nvim_get_current_buf()
  end
  local line_str = fn.getbufoneline(buf, line)
  local char_idx = fn.charidx(line_str, (byte_col - 1))
  local char_nr = fn.strgetchar(line_str, char_idx)
  if char_nr ~= -1 then
    return fn.nr2char(char_nr)
  else
    return nil
  end
end

--- Gets the zero-indexed lines from the given buffer.
---
---@param bufnr integer bufnr to get the lines from
---@param rows integer[] zero-indexed line numbers
---@return table<integer, string> a table mapping rows to lines
function M.get_lines(bufnr, rows)
  rows = type(rows) == "table" and rows or { rows }

  local lines = {}
  for _, row in ipairs(rows) do
    lines[row] = (api.nvim_buf_get_lines(bufnr, row, row + 1, false) or { "" })[1]
  end
  return lines
end

--- Gets the zero-indexed line from the given buffer.
---
---@param bufnr integer
---@param row integer zero-indexed line number
---@return string the line at row in filename
function M.get_line(bufnr, row)
  return M.get_lines(bufnr, { row })[row]
end

--- Compare two positions
---@param a lsp.Position
---@param b lsp.Position
---@return -1|0|1 -1 if a < b, 0 if a == b, 1 if a > b
function M.compare_position(a, b)
  if a.line > b.line then
    return 1
  end
  if a.line == b.line and a.character > b.character then
    return 1
  end
  if a.line == b.line and a.character == b.character then
    return 0
  end
  return -1
end

---Debounce a function.
---@param func function function to debounce
---@param time number trialing time in ms
---@return function
function M.debounce(func, time)
  local timer
  return function(...)
    local args = { ... }
    if timer and timer:is_active() then
      timer:close()
    end
    timer = vim.defer_fn(function()
      func(unpack(args))
    end, time)
  end
end

-- Since Nvim 0.10.0, `virtcol2col` changed from returning the last byte of a
-- multi-byte character to returning the first byte. However, we need the column
-- of the last byte, which is consistent with the selected region in Nvim.
-- See https://github.com/neovim/neovim/issues/29786
if fn.has("nvim-0.10.0") == 0 then
  M.virtcol2col = fn.virtcol2col
else
  ---@diagnostic disable-next-line: duplicate-set-field
  M.virtcol2col = function(winid, lnum, virtcol)
    local byte_idx = fn.virtcol2col(winid, lnum, virtcol) - 1
    local buf = api.nvim_win_get_buf(winid)
    local line = M.get_line(buf, lnum - 1)
    local char_idx = fn.charidx(line, byte_idx)
    local prefix = fn.strcharpart(line, 0, char_idx + 1)
    return #prefix
  end
end

-- Wrapper for nvim_set_option_value that sets the option only if the value differs
function M.set_option_value(name, value, opts)
  opts = opts or {}
  local current = api.nvim_get_option_value(name, opts)
  if current ~= value then
    api.nvim_set_option_value(name, value, opts)
  end
end

-- Wrapper for set_option_value to set a buffer option
function M.buf_set_option(buf, name, value)
  return M.set_option_value(name, value, { buf = buf })
end

-- Wrapper for set_option_value to set a window option
function M.win_set_option(win, name, value)
  return M.set_option_value(name, value, { win = win })
end

return M
