local code = require("vscode-neovim")

local last_item = nil

local function paste()
  local curr_text = code.call("clipboard_read"):gsub("\r\n", "\n")
  local curr_item = { vim.split(curr_text, "\n"), "v" }

  if not last_item then
    return curr_item
  end

  if not vim.deep_equal(last_item[1], curr_item[1]) then
    return curr_item
  end

  return last_item
end

local function copy(lines, regtype)
  last_item = { lines, regtype }
  local text = table.concat(lines, "\n")
  code.call("clipboard_write", { args = { text } })
end

vim.g.vscode_clipboard = {
  name = "VSCodeClipboard",
  copy = {
    ["+"] = copy,
    ["*"] = copy,
  },
  paste = {
    ["+"] = paste,
    ["*"] = paste,
  },
}

-- The user also can override g:clipboard in the init config
if vim.fn.has("wsl") == 1 then
  vim.g.clipboard = vim.g.vscode_clipboard
end
