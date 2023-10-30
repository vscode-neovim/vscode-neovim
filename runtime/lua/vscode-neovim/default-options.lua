local function setup()
  vim.cmd.syntax("on")
  -- customise statusbar
  vim.opt.shortmess = "filnxtToOFI"

  --- split/nosplit doesn't work currently, see https://github.com/asvetliakov/vscode-neovim/issues/329
  vim.opt.inccommand = ""

  -- disable matchparen because we don't need it
  vim.g.loaded_matchparen = 1
end

return { setup = setup }
