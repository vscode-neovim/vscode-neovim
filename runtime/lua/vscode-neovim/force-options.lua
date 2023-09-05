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
api.nvim_create_autocmd({ "BufEnter", "FileType" }, {
	callback = function()
		forceoptions(vim.opt_local)
	end,
})

-- send option changes to vscode, and then reset
vim.api.nvim_create_autocmd({ "OptionSet" }, {
	callback = function(ev)
		local option_name = ev.match
		vim.fn.VSCodeExtensionNotify("option-set", api.nvim_get_current_win(), option_name, {
			option_type = vim.v.option_type,
			option_new = vim.v.option_new,
			option_oldlocal = vim.v.option_oldlocal,
			option_oldglobal = vim.v.option_oldglobal,
			option_old = vim.v.option_old,
		})
		if option_name == "number" then
			vim.w.vscode_number = vim.v.option_new
		end
		if option_name == "relativenumber" then
			vim.w.vscode_relativenumber = vim.v.option_new
		end
		forceoptions(vim.opt)
	end,
})



-- People generally use autocmds to toggle number style.
-- `OptionSet` event won't be triggered without `nested` flag.
-- So we need to check it manaually.
api.nvim_create_autocmd({ "BufEnter", "InsertLeave", "BufLeave", "InsertEnter", "BufWinEnter", "BufWinLeave" }, {
	callback = function()
		local curwin = api.nvim_get_current_win()
		if vim.w.vscode_number ~= vim.wo.number then
			vim.w.vscode_number = vim.wo.number
			vim.fn.VSCodeExtensionNotify("option-set", curwin, "number", {
				option_type = "local",
				option_new = vim.wo.number,
				option_oldlocal = false,
				option_oldglobal = false,
				option_old = false,
			})
		end

		if vim.w.vscode_relativenumber ~= vim.wo.relativenumber then
			vim.w.vscode_relativenumber = vim.wo.relativenumber
			vim.fn.VSCodeExtensionNotify("option-set", curwin, "relativenumber", {
				option_type = "local",
				option_new = vim.wo.relativenumber,
				option_oldlocal = false,
				option_oldglobal = false,
				option_old = false,
			})
		end

		if vim.wo.number then
			vim.wo.number = false
		end
		if vim.wo.relativenumber then
			vim.wo.relativenumber = false
		end
	end,
})
