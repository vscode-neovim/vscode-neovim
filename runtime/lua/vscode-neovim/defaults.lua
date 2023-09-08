-- this module is responsible for setting default vim options and hiding undesired syntax groups
local M = {}

-- ignore syntax groups by default but can be overridden by `vscode-neovim.highlightGroups.highlights` or init.vim config (inside ColorScheme au)
function M.default_highlights()
  vim.api.nvim_set_hl(0, "Normal", {})
  vim.api.nvim_set_hl(0, "NormalNC", {})
  vim.api.nvim_set_hl(0, "NormalFloat", {})
  vim.api.nvim_set_hl(0, "NonText", {})
  vim.api.nvim_set_hl(0, "Visual", {})
  vim.api.nvim_set_hl(0, "VisualNOS", {})
  vim.api.nvim_set_hl(0, "Substitute", {})
  vim.api.nvim_set_hl(0, "Whitespace", {})

  -- make cursor visible for plugins that use fake cursor
  vim.api.nvim_set_hl(0, "Cursor", { reverse = true })
end

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

  M.default_highlights()
  vim.api.nvim_create_autocmd({ "FileType", "ColorScheme" }, { callback = M.default_highlights })
end

return M
