local M = {}

local api = vim.api

function M.is_visual_mode()
  local mode = vim.api.nvim_get_mode().mode
  return mode == "v" or mode == "V" or mode == "\x16"
end

function M.get_char_at(line, byte_col, buf)
  if not buf or buf == 0 then
    buf = vim.api.nvim_get_current_buf()
  end
  local line_str = vim.fn.getbufoneline(buf, line)
  local char_idx = vim.fn.charidx(line_str, (byte_col - 1))
  local char_nr = vim.fn.strgetchar(line_str, char_idx)
  if char_nr ~= -1 then
    return vim.fn.nr2char(char_nr)
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

return M
