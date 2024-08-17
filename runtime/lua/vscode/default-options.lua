local function setup()
  vim.cmd.syntax("on")
  -- customise statusbar
  vim.opt.shortmess = "filnxtToOFI"

  -- disable matchparen because we don't need it
  vim.g.loaded_matchparen = 1

  -- When enable `ext_messages`, `cmdheight` will be set to 0 by default.
  vim.opt.cmdheight = 2
end

return { setup = setup }
