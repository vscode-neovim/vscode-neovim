-- No idea why this is necessary, but it is.

local api = vim.api
local util = require("vscode.util")

api.nvim_create_autocmd({ "CursorHold", "TextChanged", "InsertLeave" }, {
  group = api.nvim_create_augroup("vscode.treesitter", {}),
  callback = util.debounce(function()
    pcall(function()
      vim.treesitter.get_parser():parse()
    end)
  end, 100),
})
