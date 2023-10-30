local api, fn = vim.api, vim.fn

local M = {}

---call from vscode to sync viewport with neovim
---@param vscode_topline number the top line of vscode visible range
---@param vscode_endline number the end line of vscode visible range
function M.scroll_viewport(vscode_topline, vscode_endline)
  local current_height = vim.api.nvim_win_get_height(0)
  local new_height = vscode_endline - vscode_topline + 1
  -- resize height
  if current_height ~= new_height then
    vim.api.nvim_win_set_height(0, new_height)
  end

  local top_line = vim.fn.line("w0")
  local diff = top_line - vscode_topline

  if diff ~= 0 and (vscode_topline > 0) then
    vim.fn.winrestview({
      topline = vscode_topline,
    })
  end
end

---Close windows
---@param wins number[]
function M.close_windows(wins)
  for _, win in ipairs(wins) do
    pcall(vim.api.nvim_win_close, win, true)
  end
end

---Delete buffers
---@param bufs number[]
function M.delete_buffers(bufs)
  for _, buf in ipairs(bufs) do
    pcall(vim.api.nvim_buf_delete, buf, { force = true })
  end
end

---Handle document changes
---@param bufnr number
---@param changes (string | integer)[][]
---@return number: changed tick of the buffer
function M.handle_changes(bufnr, changes)
  -- Save and restore local marks
  -- Code modified from https://github.com/neovim/neovim/pull/14630
  local marks = {}
  for _, m in pairs(fn.getmarklist(bufnr or api.nvim_get_current_buf())) do
    if m.mark:match("^'[a-z]$") then
      marks[m.mark:sub(2, 2)] = { m.pos[2], m.pos[3] - 1 } -- api-indexed
    end
  end

  for _, change in ipairs(changes) do
    api.nvim_buf_set_text(bufnr, unpack(change))
  end

  local max = api.nvim_buf_line_count(bufnr)
  -- no need to restore marks that still exist
  for _, m in pairs(fn.getmarklist(bufnr or api.nvim_get_current_buf())) do
    marks[m.mark:sub(2, 2)] = nil
  end
  -- restore marks
  for mark, pos in pairs(marks) do
    if pos then
      -- make sure we don't go out of bounds
      local line = (api.nvim_buf_get_lines(bufnr, pos[1] - 1, pos[1], false))[1] or ""
      pos[1] = math.min(pos[1], max)
      pos[2] = math.min(pos[2], #line)
      api.nvim_buf_set_mark(bufnr or 0, mark, pos[1], pos[2], {})
    end
  end

  return api.nvim_buf_get_changedtick(bufnr)
end

do
  --- Replay changes for dotrepeat ---

  local _curr_win, _temp_buf, _temp_win

  ---@param edits string
  ---@param deletes number
  function M.dotrepeat_sync(edits, deletes)
    local ei = vim.opt.ei:get()
    vim.opt.ei = "all"

    _curr_win = api.nvim_get_current_win()
    _temp_buf = api.nvim_create_buf(false, true)
    _temp_win = api.nvim_open_win(_temp_buf, true, { external = true, width = 100, height = 50 })

    if deletes > 0 then
      api.nvim_buf_set_lines(_temp_buf, 0, -1, false, { ("x"):rep(deletes) })
      api.nvim_win_set_cursor(_temp_win, { 1, deletes })
      local bs = ("<BS>"):rep(deletes)
      bs = api.nvim_replace_termcodes(bs, true, true, true)
      api.nvim_feedkeys(bs, "n", false)
    end
    api.nvim_feedkeys(edits, "n", false)

    vim.opt.ei = ei
  end

  function M.dotrepeat_restore()
    local ei = vim.opt.ei:get()
    vim.opt.ei = "all"

    api.nvim_set_current_win(_curr_win)
    pcall(api.nvim_win_close, _temp_win, true)
    pcall(api.nvim_buf_delete, _temp_buf, { force = true })

    vim.opt.ei = ei
  end
end

return M
