---@diagnostic disable: deprecated
local api, fn = vim.api, vim.fn

local vscode = require("vscode.api")
local util = require("vscode.util")

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

---@class CleanupOpts
---@field windows number[]
---@field buffers number[]

---Close windows and buffers. This is done together in one call to reduce RPC
---overhead, but still ensures buffer cleanup happens after window cleanup.
---@param opts CleanupOpts
function M.cleanup_windows_and_buffers(opts)
  for _, win in ipairs(opts.windows) do
    pcall(vim.api.nvim_win_close, win, true)
  end

  for _, buf in ipairs(opts.buffers) do
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

  -- The changes from vscode are all expected and must be applied.
  local ro = vim.bo[bufnr].ro
  local ma = vim.bo[bufnr].ma
  vim.bo[bufnr].ro = false
  vim.bo[bufnr].ma = true
  for _, change in ipairs(changes) do
    api.nvim_buf_set_text(bufnr, unpack(change))
  end
  vim.bo[bufnr].ro = ro
  vim.bo[bufnr].ma = ma

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
    api.nvim_feedkeys(edits, "n", true)

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

---Get editor's selections
---@return lsp.Range[]
function M.get_selections(win)
  win = win or api.nvim_get_current_win()
  local buf = api.nvim_win_get_buf(win)
  local mode = api.nvim_get_mode().mode
  local is_visual = mode:match("[vV\x16]")

  local function wincall(cb)
    return api.nvim_win_call(win, cb)
  end

  -- normal

  if not is_visual then
    local pos = vim.lsp.util.make_position_params(win, "utf-16").position
    return { { start = pos, ["end"] = pos } }
  end

  -- linewise/charwise visual

  if mode:lower() == "v" then
    local start_pos, end_pos
    wincall(function()
      start_pos = { fn.line("v"), fn.col("v") - 1 }
      end_pos = { fn.line("."), fn.col(".") - 1 }
    end)
    local start_from_left = true

    if start_pos[1] > end_pos[1] or (start_pos[1] == end_pos[1] and start_pos[2] > end_pos[2]) then
      start_from_left = false
      start_pos, end_pos = end_pos, start_pos
    end

    if mode == "V" then
      start_pos = { start_pos[1], 0 }
      end_pos = { end_pos[1], #(fn.getbufline(buf, end_pos[1])[1] or "") }
    end

    local range = vim.lsp.util.make_given_range_params(start_pos, end_pos, buf, "utf-16").range
    if not start_from_left then
      range = { start = range["end"], ["end"] = range.start }
    end
    return { range }
  end

  -- blockwise visual

  local ranges = {}

  -- 1-indexed {
  local start_line_1, end_line_1, start_vcol, end_vcol
  wincall(function()
    start_line_1 = fn.line("v")
    end_line_1 = fn.line(".")
    start_vcol = fn.virtcol("v")
    end_vcol = fn.virtcol(".")
  end)
  local curr_line_1 = end_line_1
  -- }
  local top_to_bottom = start_line_1 < end_line_1 or (start_line_1 == end_line_1 and start_vcol <= end_vcol)
  local start_from_left = end_vcol >= start_vcol
  if start_line_1 > end_line_1 then
    start_line_1, end_line_1 = end_line_1, start_line_1
  end
  if start_vcol > end_vcol then
    start_vcol, end_vcol = end_vcol, start_vcol
  end

  for line_1 = start_line_1, end_line_1 do
    local line_0 = line_1 - 1
    local line_text = fn.getbufline(buf, line_1)[1] or ""
    local line_diswidth = wincall(function()
      return fn.strdisplaywidth(line_text)
    end)
    if start_vcol > line_diswidth then
      if line_1 == curr_line_1 then
        local pos = { line = line_0, character = ({ vim.str_utfindex(line_text) })[2] }
        table.insert(ranges, { start = pos, ["end"] = pos })
      else
        -- ignore
      end
    else
      local start_col = util.virtcol2col(win, line_1, start_vcol)
      local end_col = util.virtcol2col(win, line_1, end_vcol)
      local start_col_offset = fn.strlen(util.get_char_at(line_1, start_col, buf) or "")
      local end_col_offset = fn.strlen(util.get_char_at(line_1, end_col, buf) or "")
      local range = vim.lsp.util.make_given_range_params(
        { line_1, math.max(0, start_col - start_col_offset) },
        { line_1, math.max(0, end_col - end_col_offset) },
        buf,
        "utf-16"
      ).range
      if not start_from_left then
        range = { start = range["end"], ["end"] = range.start }
      end
      table.insert(ranges, range)
    end
  end

  if #ranges == 0 then
    -- impossible
    local pos = vim.lsp.util.make_position_params(win, "utf-16").position
    return { { start = pos, ["end"] = pos } }
  end

  if top_to_bottom then
    local ret = {}
    for i = #ranges, 1, -1 do
      table.insert(ret, ranges[i])
    end
    return ret
  else
    return ranges
  end
end

---@param buf integer
---@param anchor lsp.Position
---@param active lsp.Position
function M.start_visual(buf, anchor, active)
  if buf ~= api.nvim_get_current_buf() then
    return
  end

  if util.compare_position(anchor, active) == 1 then
    anchor.character = math.max(0, anchor.character - 1)
  else
    active.character = math.max(0, active.character - 1)
  end

  local anchor_line = anchor.line + 1
  local active_line = active.line + 1
  local anchor_line_text = util.get_line(buf, anchor.line)
  local active_line_text = util.get_line(buf, active.line)
  local anchor_col = vim.str_byteindex(anchor_line_text, anchor.character, true)
  local active_col = vim.str_byteindex(active_line_text, active.character, true)

  local v = fn.visualmode(1)
  api.nvim_buf_set_mark(buf, "<", anchor_line, anchor_col, {})
  api.nvim_buf_set_mark(buf, ">", active_line, active_col, {})
  api.nvim_feedkeys((v == "V" or v == "\x16") and "gvv" or "gv", "n", false)
end

---Translate from a Windows path to a WSL path
---@param path string
---@return string
function M.wslpath(path)
  local ok, ret = pcall(vim.fn.system, { "wslpath", path })
  if not ok then
    vim.notify(ret, vim.log.levels.ERROR)
    return path
  end
  return vim.trim(ret)
end

--#region Buffer management

--- 1. Implements :write and related commands, via buftype=acwrite. #521 #1260
--- 2. Syncs buffer modified status with vscode. #247
local function set_buffer_autocmd(buf)
  api.nvim_create_autocmd({ "BufWriteCmd" }, {
    buffer = buf,
    callback = function(ev)
      local current_name = api.nvim_buf_get_name(ev.buf)
      local target_name = ev.match
      local data = {
        buf = ev.buf,
        bang = vim.v.cmdbang == 1,
        current_name = current_name,
        target_name = target_name,
      }
      vscode.action("save_buffer", { args = { data } })
    end,
  })
  api.nvim_create_autocmd({ "BufModifiedSet" }, {
    buffer = buf,
    callback = function(ev)
      fn.VSCodeExtensionNotify("BufModifiedSet", {
        buf = ev.buf,
        modified = vim.bo[ev.buf].mod,
      })
    end,
  })
end

---@class InitDocumentBufferData
---@field buf number
---@field lines string[]
---@field editor_options EditorOptions
---@field uri string
---@field uri_data table
---@field modifiable boolean
---@field bufname string
---@field modified boolean
---@field filetype string|vim.NIL

---@param data InitDocumentBufferData
function M.init_document_buffer(data)
  local buf = data.buf

  -- 1. Force filetype before setting buffer name and lines, vim.filetype will handle the b:vscode_filetype
  -- 2. Finally, set the filetype again just in case
  local force_filetype = function()
    if data.filetype and data.filetype ~= vim.NIL then
      api.nvim_buf_set_var(buf, "vscode_filetype", data.filetype)
      api.nvim_buf_set_option(buf, "filetype", data.filetype)
    end
  end

  force_filetype()
  -- Set bufname before setting lines so that filetype detection can work ???
  api.nvim_buf_set_name(buf, data.bufname)
  -- Let nvim resolve the physical path of our file to avoid relative path issues
  -- with symbolic links when saving the buffer. #2284
  api.nvim_buf_set_name(buf, api.nvim_buf_get_name(buf))
  api.nvim_buf_set_lines(buf, 0, -1, false, data.lines)
  -- set vscode controlled flag so we can check it neovim
  api.nvim_buf_set_var(buf, "vscode_controlled", true)
  -- In vscode same document can have different insertSpaces/tabSize settings
  -- per editor; in Nvim it's per buffer. We assume here that these settings are
  -- same for all editors.
  api.nvim_buf_set_var(buf, "vscode_editor_options", data.editor_options)
  api.nvim_buf_set_var(buf, "vscode_uri", data.uri)
  api.nvim_buf_set_var(buf, "vscode_uri_data", data.uri_data)
  -- force acwrite, which is similar to nofile, but will only be written via the
  -- BufWriteCmd autocommand. #521 #1260
  api.nvim_buf_set_option(buf, "buftype", "acwrite")
  api.nvim_buf_set_option(buf, "buflisted", true)
  api.nvim_buf_set_option(buf, "modifiable", data.modifiable)
  api.nvim_buf_set_option(buf, "modified", data.modified)
  force_filetype()

  set_buffer_autocmd(buf)
end

---Reset undo tree for a buffer
-- Called from extension when opening/creating new file in vscode to reset undo tree
function M.clear_undo(buf)
  local mod = vim.bo[buf].modified
  local ul = vim.bo[buf].undolevels
  api.nvim_buf_set_option(buf, "undolevels", -1)
  api.nvim_buf_set_lines(buf, 0, 0, false, {})
  api.nvim_buf_set_option(buf, "undolevels", ul)
  api.nvim_buf_set_option(buf, "modified", mod)
end

--#endregion

return M
