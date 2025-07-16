local api = vim.api

local ns = api.nvim_create_namespace("vscode.statusline")

local function get_status()
  if vim.o.laststatus == 0 then
    return ""
  end

  local info = api.nvim_get_option_info2("statusline", {})

  if not info.was_set then
    return ""
  end

  local str = api.nvim_eval_statusline(vim.o.statusline, {}).str
  return str:gsub("\n", " "):gsub("%s+", " ")
end

local curr_status = ""

local function refresh()
  local status = get_status()

  if curr_status ~= status then
    curr_status = status
    vim.fn.VSCodeExtensionNotify("statusline", curr_status)
  end
end

api.nvim_set_decoration_provider(ns, { on_end = refresh })
