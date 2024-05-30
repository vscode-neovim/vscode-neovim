local api = vim.api

local ns = api.nvim_create_namespace("vscode.statusline")
local curr_status = ""

local function refresh()
  local status = ""

  if vim.o.laststatus == 0 then
    status = ""
  else
    status = api.nvim_eval_statusline(vim.o.statusline, {}).str
  end

  if #status > 0 then
    status = status:gsub("\n", " "):gsub("%s+", " ")
  end

  if curr_status ~= status then
    curr_status = status
    vim.fn.VSCodeExtensionNotify("statusline", curr_status)
  end
end

api.nvim_set_decoration_provider(ns, { on_end = refresh })
