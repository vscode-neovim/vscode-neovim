--[[
INIT CODE
    will prob have to move this to a file when making the plugin
--]]

local utils = require("vscode.word_wrap.utils")
local vscode
local keymaps

if vim.g.vscode then
  vscode = require("vscode")
  vim.notify = vscode.notify
  keymaps = require("vscode.word_wrap.keymaps-vscode")
  -- else
  -- 	keymaps = require("utils.keymaps-neovim")
end

vim.keymap.set("n", "<leader>uw", function()
  if utils.is_macro_recording() or utils.is_macro_executing() then
    vim.notify("ToggleWrap disabled during macro execution", vim.log.levels.WARN)
    return
  end

  if vim.g.vscode then
    local new_wrap = not utils.get_vscode_wrap().enabled
    vim.cmd("ToggleWrap " .. tostring(new_wrap))
    return
  end

  vim.cmd("ToggleWrap")
end, { desc = "[u]i toggle line [w]rap and movement" })

--[[
MAIN USERCMD FOR TOGGLE WRAP
    neovim & vscode compatible
--]]

vim.api.nvim_create_user_command("ToggleWrap", function(ctx)
  local arg = ctx.args

  ---Toggle or explicitly set word wrap and related editor options.
  ---@param enabled boolean? If true, enable wrap; if false, disable wrap; if nil, toggle current state.
  ---@return boolean The resulting state of wrap (true = enabled, false = disabled)
  local function ToggleWrap(enabled)
    ---@type boolean
    if enabled == nil then
      local current = vim.g.vscode and utils.get_vscode_wrap().enabled or vim.wo.wrap
      enabled = not current
    end

    if vim.g.vscode then
      local new_wrap_mode = enabled and "bounded" or "off"
      vscode.update_config("editor.wordWrap", new_wrap_mode, "global")
      if not enabled then
        utils.unset_wrap_keymaps(keymaps)
        return enabled
      end
      utils.set_wrap_keymaps(keymaps)
      return enabled
    end

    -- capture exact current location
    local cur_tab = vim.api.nvim_get_current_tabpage()
    local cur_win = vim.api.nvim_get_current_win()

    -- set global defaults so future windows/buffers inherit
    vim.opt_global.wrap = enabled
    vim.opt_global.linebreak = enabled
    if enabled then
      vim.opt_global.formatoptions:remove("l")
      utils.set_wrap_keymaps(keymaps)
    else
      vim.opt_global.formatoptions:append("l")
      utils.unset_wrap_keymaps(keymaps)
    end

    -- apply to all existing windows in all tabs without stealing focus
    for _, tab in ipairs(vim.api.nvim_list_tabpages()) do
      for _, win in ipairs(vim.api.nvim_tabpage_list_wins(tab)) do
        pcall(vim.api.nvim_win_call, win, function()
          vim.opt_local.wrap = enabled
          vim.opt_local.linebreak = enabled
          if enabled then
            vim.opt_local.formatoptions:remove("l")
          else
            vim.opt_local.formatoptions:append("l")
          end
        end)
      end
    end

    -- restore exact original tab and window
    pcall(vim.api.nvim_set_current_tabpage, cur_tab)
    pcall(vim.api.nvim_set_current_win, cur_win)

    if not ctx.smods.silent then
      vim.notify(enabled and "✅ Wrap enabled" or "❌ Wrap disabled")
    end

    return enabled
  end

  if arg == nil or arg == "" then
    ToggleWrap()
    return
  end

  local s = arg:lower()
  local bool
  if s == "true" or s == "on" or s == "1" then
    bool = true
  elseif s == "false" or s == "off" or s == "0" then
    bool = false
  else
    if not ctx.smods.silent then
      vim.notify("ToggleWrap: invalid argument. Use 'on'/'off' or no arg to toggle.", vim.log.levels.WARN)
    end
    return
  end

  ToggleWrap(bool)
end, {
  complete = function()
    return { "on", "off" }
  end,
  nargs = "?",
  desc = "Toggle or set wrap (use 'on'/'off' or no arg to toggle)",
})

--[[
AUTOCMD's FOR TOGGLE WRAP
    couldnt figure out how to make wordwrap keymaps to work with recording macros and in vscode so just disable wrap and keymaps when recording
    i was however able to get the keymaps to work WHILE executing macros
--]]

-- ToggleWrap off upon RecordingEnter
local my_group = vim.api.nvim_create_augroup("ToggleWrap", { clear = true })
vim.api.nvim_create_autocmd({ "RecordingEnter" }, {
  group = my_group,
  callback = function()
    local ok, err = pcall(vim.cmd, "ToggleWrap off")
    if not ok then
      vim.notify("Error disabling wrap: " .. err, vim.log.levels.ERROR)
      return
    end
    vim.notify("Macro detected, wordWrap & keymaps disabled...", vim.log.levels.INFO)
  end,
})

-- -- NOTE: below autocmd interfered with keymaps and just general usage so disabled it. keeping just incase though.
-- -- ToggleWrap off upon CmdlineLeave if using :norm command
-- vim.api.nvim_create_autocmd("CmdlineLeave", {
-- 	group = my_group,
-- 	callback = function()
-- 		local cmd = vim.fn.getcmdline() or ""

-- 		if cmd:match("^%s*norm%a*") then
-- 			local ok, err = pcall(vim.cmd, "ToggleWrap off")
-- 			if not ok then
-- 				vim.notify("Error disabling wrap: " .. err, vim.log.levels.ERROR)
-- 				return
-- 			end
-- 			vim.notify("Command detected, wordWrap & keymaps disabled...", vim.log.levels.INFO)
-- 		end
-- 	end,
-- })

-- Keep vscode wrap state in sync
if vim.g.vscode then
  vim.api.nvim_create_autocmd({ "CursorHold", "VimEnter" }, {
    group = my_group,
    callback = function()
      local enabled = utils.get_vscode_wrap().enabled
      local cmd = enabled and "ToggleWrap on" or "ToggleWrap off"
      -- use a delay to avoid startup errors
      vim.defer_fn(function()
        pcall(vim.cmd, "silent " .. cmd)
      end, 300)
    end,
  })
end
