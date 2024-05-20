local M = {}

local api, fn = vim.api, vim.fn

M.event_group = api.nvim_create_augroup("vscode-neovim.viewport", { clear = true })
M.viewport_changed_ns = api.nvim_create_namespace("vscode-neovim.viewport.changed")

---@class WinView All positions are 0-based
---@field lnum integer
---@field col integer
---@field coladd integer
---@field curswant integer
---@field topline integer
---@field topfill integer
---@field leftcol integer
---@field skipcol integer
---@field winid integer

---@return WinView
local function get_winview()
  local view = fn.winsaveview()
  view.lnum = view.lnum - 1
  view.topline = view.topline - 1
  view.winid = api.nvim_get_current_win()
  return view
end

local function setup_viewport_changed()
  ---@type table<integer, WinView>
  local view_cache = {}

  api.nvim_set_decoration_provider(M.viewport_changed_ns, {
    on_win = function()
      local view = get_winview()
      local cache = view_cache[view.winid]
      if cache and vim.deep_equal(view, cache) then
        return
      end
      view_cache[view.winid] = view
      fn.VSCodeExtensionNotify("viewport-changed", view)
    end,
  })

  -- cleanup cache
  api.nvim_create_autocmd({ "WinClosed" }, {
    group = M.event_group,
    callback = function()
      local wins = vim.tbl_keys(view_cache)
      for _, win in ipairs(wins) do
        if not api.nvim_win_is_valid(win) then
          view_cache[win] = nil
        end
      end
    end,
  })
end

function M.setup()
  -- Highlighting needs to wait for the viewport-changed event to complete.
  -- When the UI attaches, there are numerous highlight events (hl_attr_define, grid_line) to process.
  --
  -- Without delaying the setup, the viewport-changed event will cause frequent
  -- pauses in highlight processing, resulting in screen flickering.
  api.nvim_create_autocmd({ "UIEnter" }, {
    once = true,
    callback = function()
      -- Don't worry about whether it's set too late.
      vim.defer_fn(setup_viewport_changed, 1000)
    end,
  })
end

return M
