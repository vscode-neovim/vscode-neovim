--- This file is used to force set options which may break the extension. Loaded after user config by main_controller.
local api = vim.api

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

-- --------------------- forced global and local critical options -------------------- --
local function forceoptions(opt)
  opt.wrap = false
  opt.conceallevel = 0
  opt.hidden = true
  opt.bufhidden = "hide"
  opt.list = true
  -- Fix the gutter width, no need to consider highlighting issues caused by number, signcolumn, foldcolumn anymore.
  -- {{
  opt.numberwidth = 1
  opt.statuscolumn = "%#NonText#" .. ("-"):rep(20) -- max-signcolumn(9) + max-foldcolumn(9) + numberwidth(1) + 1
  -- }}
  opt.listchars = { tab = "  " }
  --- Turn off auto-folding
  opt.foldenable = false
  opt.foldcolumn = "0"
  opt.foldmethod = "manual"
  --- lazyredraw breaks the movement
  opt.lazyredraw = false
end

-- force global options on startup
forceoptions(vim.opt)

local group = api.nvim_create_augroup("VSCodeForceOptions", { clear = true })
-- force local options on buffer load
api.nvim_create_autocmd({ "BufEnter", "FileType" }, {
  group = group,
  callback = function()
    forceoptions(vim.opt_local)
  end,
})
