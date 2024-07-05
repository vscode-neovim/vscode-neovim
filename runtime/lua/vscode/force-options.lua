--- This file is used to force set options which may break the extension.
local M = {}

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

local function force_global_options()
  vim.opt.wildmode = "longest:full,full"
  vim.cmd([[set wildchar=<Tab>]])
  vim.opt.mouse = "a"

  vim.opt.backup = false
  vim.opt.wb = false
  vim.opt.swapfile = false
  vim.opt.autoread = false
  vim.opt.autowrite = false
  vim.opt.cursorline = false
  vim.opt.signcolumn = "no"
  vim.opt.winblend = 0

  vim.opt.ruler = false
  vim.opt.colorcolumn = nil

  forceoptions(vim.opt)
end

local function force_local_options()
  forceoptions(vim.opt_local)
end

function M.setup()
  -- force options on startup
  force_global_options()
  force_local_options()

  local group = vim.api.nvim_create_augroup("vscode.force-options", { clear = true })
  vim.api.nvim_create_autocmd({ "VimEnter" }, {
    group = group,
    callback = force_global_options,
  })
  vim.api.nvim_create_autocmd({ "VimEnter", "BufEnter", "FileType" }, {
    group = group,
    callback = force_local_options,
  })
end

return M
