local api = vim.api

local ns = api.nvim_create_namespace("vscode.statusline")
local curr_status = ""

local function refresh()
  local status = ""

  if vim.o.laststatus == 0 or vim.o.statusline == "" then
    status = ""
  else
    local str = api.nvim_eval_statusline(vim.o.statusline, {}).str
    status = str:gsub("\n", " "):gsub("%s+", " ")
  end

  if curr_status ~= status then
    curr_status = status
    vim.fn.VSCodeExtensionNotify("statusline", curr_status)
  end
end

api.nvim_set_decoration_provider(ns, { on_end = refresh })
