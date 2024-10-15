--[[
1. Synchronize options: tabstop, shiftwidth, expandtab, number, relativenumber
  Check for changes in nvim and then send them to vscode
  Receive changes from vscode and set nvim options

2. Process modeline
  The buffer's initial text is filled after creating the buffer,
  the modeline processing needs to be triggered manually.
  Additionally, the scratch buffer sets nomodeline by default.
]]

local api = vim.api
local vscode = require("vscode.api")
local util = require("vscode.util")

local M = {}

---@class EditorOptions
---@field tabSize number
---@field insertSpaces boolean
---@field lineNumbers "on"|"off"|"relative"

---@param nu boolean number
---@param rnu boolean relativenumber
---@return "on"|"off"|"relative"
local function get_number_style(nu, rnu)
  return rnu and "relative" or nu and "on" or "off"
end

---@param win number
---@param lineNumbers "on"|"off"|"relative"
local function set_number(win, lineNumbers)
  if lineNumbers == "relative" then
    util.win_set_option(win, "relativenumber", true)
  elseif lineNumbers == "on" then
    util.win_set_option(win, "number", true)
    util.win_set_option(win, "relativenumber", false)
  else
    util.win_set_option(win, "number", false)
    util.win_set_option(win, "relativenumber", false)
  end
end

---Handle changes from vscode
---Set nvim options
---@param buf number
---@param opts EditorOptions
local function set_options(buf, opts)
  if not api.nvim_buf_is_valid(buf) then
    return
  end

  api.nvim_buf_set_var(buf, "vscode_editor_options", opts)

  util.buf_set_option(buf, "tabstop", opts.tabSize)
  util.buf_set_option(buf, "shiftwidth", opts.tabSize)
  util.buf_set_option(buf, "expandtab", opts.insertSpaces)

  local win = api.nvim_get_current_win()
  if api.nvim_win_get_buf(win) == buf then
    set_number(win, opts.lineNumbers)
  end
end

---Check changes from nvim
---Set vscode options
local function _check_options()
  local vscode_opts = vim.b.vscode_editor_options
  if not vscode_opts then -- should not happen
    return
  end

  if not vim.b.vscode_editor_options_first_checked then --load the defaults
    vim.b.vscode_editor_options_first_checked = true
    util.buf_set_option(0, "tabstop", vscode_opts.tabSize)
    util.buf_set_option(0, "shiftwidth", vscode_opts.tabSize)
    util.buf_set_option(0, "expandtab", vscode_opts.insertSpaces)
    set_number(0, vscode_opts.lineNumbers)
    return
  end

  local buf = api.nvim_get_current_buf()
  local ts, sw, et = vim.bo.ts, vim.bo.sw, vim.bo.et

  if sw ~= ts then
    util.buf_set_option(buf, "shiftwidth", ts) -- must be the same
  end

  local nvim_opts = {
    tabSize = ts,
    insertSpaces = et,
    lineNumbers = get_number_style(vim.wo.nu, vim.wo.rnu),
  }

  if vim.deep_equal(nvim_opts, vscode_opts) then
    return
  end

  vim.b.vscode_editor_options = nvim_opts
  vscode.action("set_editor_options", { args = { buf, nvim_opts } })
end

local check_options = util.debounce(_check_options, 20)

local function process_modeline()
  if vim.b.vscode_editor_options_first_checked then
    if not vim.b.vscode_processed_modeline then
      vim.b.vscode_processed_modeline = true
      if vim.go.modeline then -- nomodeline by default for scratch buffer
        vim.bo.modeline = true
      end
      vim.cmd.doautocmd("CursorMoved") -- process modeline
      check_options()
    end
  end
end

function M.setup()
  vscode.on("editor_options_changed", set_options)
  vscode.on("document_buffer_init", function(buf)
    if not api.nvim_buf_is_valid(buf) then
      return
    end
    local has, opts = pcall(api.nvim_buf_get_var, buf, "vscode_editor_options")
    if has then
      set_options(buf, opts)
      vim.defer_fn(process_modeline, 100)
    end
  end)

  local group = api.nvim_create_augroup("vscode.sync-editor-options", { clear = true })
  -- options
  api.nvim_create_autocmd({ "OptionSet" }, {
    group = group,
    callback = check_options,
    pattern = { "tabstop", "shiftwidth", "expandtab", "number", "relativenumber" },
  })
  api.nvim_create_autocmd(
    { "CursorMoved", "BufWinEnter", "InsertEnter", "InsertLeave", "FileType" },
    { group = group, callback = check_options }
  )
  -- modeline
  api.nvim_create_autocmd({ "BufWinEnter", "WinEnter", "CursorMoved", "FileType" }, {
    group = group,
    callback = process_modeline,
  })
end

return M
