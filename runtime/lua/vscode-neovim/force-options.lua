--- This file is used to force set options which may break the extension. Loaded after user config by main_controller.

-- ------------------------- forced global options ------------------------- --
vim.opt.cmdheight = 1
vim.opt.wildmode = "list"
vim.cmd([[set wildchar=<C-e>]])
vim.opt.mouse = "a"

vim.opt.backup = false
vim.opt.wb = false
vim.opt.swapfile = false
vim.opt.autoread = false
vim.opt.autowrite = false
vim.opt.cursorline = false
vim.opt.signcolumn = "no"
vim.opt.winblend = 0

--- Disable statusline and ruler since we don't need them anyway
vim.opt.statusline = ""
vim.opt.laststatus = 0
vim.opt.ruler = false
vim.opt.colorcolumn = nil

--- Disable modeline processing. It's being used for tab related settings usually and we don't want to override ours
vim.opt.modeline = false
vim.opt.modelines = 0

--- Allow to use vim HL for external buffers, vscode buffers explicitly disable it
vim.cmd([[syntax on]])

-- --------------------- forced global and local critical options -------------------- --
local function forceoptions(opt)
  opt.wrap = false
  opt.conceallevel = 0
  opt.hidden = true
  opt.bufhidden = "hide"
  opt.number = false
  opt.relativenumber = false
  opt.list = true
  --- Need to know tabs for HL
  opt.listchars = { tab = "❥♥" }
  -- disable syntax hl for vscode buffers
  if vim.b.vscode_controlled and opt == vim.opt_local then
    opt.syntax = "off"
  end
  --- Turn off auto-folding
  opt.foldenable = false
  opt.foldcolumn = "0"
  opt.foldmethod = "manual"
  --- lazyredraw breaks the movement
  opt.lazyredraw = false
end

-- force global options on startup
forceoptions(vim.opt)

-- force local options on buffer load
vim.api.nvim_create_autocmd({ "BufEnter", "FileType" }, {
  callback = function()
    forceoptions(vim.opt_local)
  end,
})
