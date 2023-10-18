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
local vscode = require("vscode-neovim.api")

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
    vim.wo[win].rnu = true
  elseif lineNumbers == "on" then
    vim.wo[win].nu = true
    vim.wo[win].rnu = false
  else
    vim.wo[win].nu = false
    vim.wo[win].rnu = false
  end
end

---Handle changes from vscode
---Set nvim options
---@param buf number
---@param opts EditorOptions
local function set_options(buf, opts)
  api.nvim_buf_set_var(buf, "vscode_editor_options", opts)
  if vim.bo[buf].ts ~= opts.tabSize then
    vim.bo[buf].ts = opts.tabSize
    vim.bo[buf].sw = opts.tabSize
  end
  if vim.bo[buf].et ~= opts.insertSpaces then
    vim.bo[buf].et = opts.insertSpaces
  end

  local win
  for _, w in ipairs(api.nvim_list_wins()) do
    local win_buf = api.nvim_win_get_buf(w)
    if win_buf == buf then
      win = w
      break
    end
  end

  if win then
    set_number(win, opts.lineNumbers)
  end
end

---Check changes from nvim
---Set vscode options
local function _check_options()
  ---@type EditorOptions?
  local opts = vim.b.vscode_editor_options
  if not opts then -- should not happen
    return
  end
  if not vim.b.vscode_editor_options_first_checked then -- load the defaults
    vim.b.vscode_editor_options_first_checked = true
    vim.bo.ts = opts.tabSize
    vim.bo.sw = opts.tabSize
    vim.bo.expandtab = opts.insertSpaces
    set_number(0, opts.lineNumbers)
    return
  end

  local ts, sw, et = vim.bo.ts, vim.bo.sw, vim.bo.et
  local lineNumbers = get_number_style(vim.wo.nu, vim.wo.rnu)

  if sw ~= ts then
    vim.bo.sw = ts -- must be the same
  end

  if ts ~= opts.tabSize or et ~= opts.insertSpaces or lineNumbers ~= opts.lineNumbers then
    opts.tabSize = ts
    opts.insertSpaces = et
    opts.lineNumbers = lineNumbers
    vim.b.vscode_editor_options = opts
    vscode.action("set_editor_options", { args = { api.nvim_get_current_buf(), opts } })
  end
end

local check_options = (function()
  local check_timer
  return function()
    if check_timer and check_timer:is_active() then
      check_timer:close()
    end
    check_timer = vim.defer_fn(_check_options, 20)
  end
end)()

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
    local has, opts = pcall(api.nvim_buf_get_var, buf, "vscode_editor_options")
    if has then
      set_options(buf, opts)
      vim.defer_fn(process_modeline, 100)
    end
  end)

  local group = api.nvim_create_augroup("VSCodeSyncEditorOptions", { clear = true })
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
