-- this module is responsible for setting default vim options
local M = {}

function M.setup()
  -- customise statusbar
  vim.opt.shortmess = "filnxtToOFI"

  --- Turn on auto-indenting
  vim.opt.autoindent = true
  vim.opt.smartindent = true

  --- split/nosplit doesn't work currently, see https://github.com/asvetliakov/vscode-neovim/issues/329
  vim.opt.inccommand = ""

  -- disable matchparen because we don't need it
  vim.g.loaded_matchparen = 1
end

return M
