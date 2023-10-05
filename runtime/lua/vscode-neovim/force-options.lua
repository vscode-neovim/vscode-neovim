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

--- Disable modeline processing. It's being used for tab related settings usually and we don't want to override ours
vim.opt.modeline = false
vim.opt.modelines = 0

vim.cmd.syntax("on")

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

-- force local options on buffer load
api.nvim_create_autocmd({ "BufEnter", "FileType" }, {
  callback = function()
    forceoptions(vim.opt_local)
  end,
})

--- Synchronize Line Number Style ---
-- TODO: Allow configing whether to sync the number option

local check_number = (function()
  local function _check_number()
    local number, relativenumber = vim.wo.number, vim.wo.relativenumber
    if vim.w.vscode_number ~= number or vim.w.vscode_relativenumber ~= relativenumber then
      vim.w.vscode_number = number
      vim.w.vscode_relativenumber = relativenumber
      local style = "off"
      if number then
        style = "on"
      end
      if relativenumber then
        style = "relative"
      end
      vim.fn.VSCodeExtensionNotify("change-number", api.nvim_get_current_win(), style)
    end
  end
  local check_timer
  return function()
    if check_timer and check_timer:is_active() then
      check_timer:close()
    end
    check_timer = vim.defer_fn(_check_number, 10)
  end
end)()

api.nvim_create_autocmd("OptionSet", {
  pattern = { "number", "relativenumber" },
  callback = check_number,
})

api.nvim_create_autocmd({
  "CursorMoved",
  "BufLeave",
  "BufEnter",
  "InsertLeave",
  "InsertEnter",
}, {
  callback = function()
    if not vim.b.vscode_loaded_default_number then
      vim.wo.number = not not vim.b.vscode_number
      vim.wo.relativenumber = not not vim.b.vscode_relativenumber
      ---@diagnostic disable-next-line: inject-field
      vim.b.vscode_loaded_default_number = true
    else
      check_number()
    end
  end,
})
