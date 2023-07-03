--- This file is used to force set options which may break the extension. Loaded after user config

vim.opt.shortmess = "filnxtToOFI"
vim.opt.cmdheight = 1
vim.opt.wildmode = "list"
vim.cmd([[set wildchar=<C-e>]])
vim.opt.mouse = "a"

vim.opt.backup = false
vim.opt.wb = false
vim.opt.swapfile = false
vim.opt.autoread = false
vim.opt.cursorline = false
vim.opt.signcolumn = "no"

--- Disable statusline and ruler since we don't need them anyway
vim.opt.statusline = ""
vim.opt.laststatus = 0
vim.opt.ruler = false

--- Disable modeline processing. It's being used for tab related settings usually and we don't want to override ours
vim.opt.modeline = false
vim.opt.modelines = 0

--- Turn on auto-indenting
vim.opt.autoindent = true
vim.opt.smartindent = true

--- split/nosplit doesn't work currently, see https://github.com/asvetliakov/vscode-neovim/issues/329
vim.opt.inccommand = ""

--- Allow to use vim HL for external buffers, vscode buffers explicitly disable it
vim.cmd [[syntax on]]

-- make cursor visible for plugins what use fake cursor
vim.api.nvim_set_hl(0, 'Cursor', { reverse = true })

-- these are applied to global options and forced on local options
local function forceoptions(opt)
    opt.wrap = false
    opt.conceallevel = 0
    opt.hidden = true
    opt.bufhidden = "hide"
    opt.autowrite = false
    opt.number = false
    opt.relativenumber = false
    opt.list = true
    --- Need to know tabs for HL
    opt.listchars = { tab = "❥♥" }
    -- disable syntax hl for vscode buffers
    if vim.b.vscode_controlled then
        opt.syntax = "off"
    end
    --- Turn off auto-folding
    opt.foldenable = false
    opt.foldcolumn = "0"
    opt.foldmethod = "manual"
    --- lazyredraw breaks the movement
    opt.lazyredraw = false
end

forceoptions(vim.opt)

-- force local options on buffer load
vim.api.nvim_create_autocmd({ "BufEnter", "FileType" }, {
    callback = function() forceoptions(vim.opt_local) end,
})
