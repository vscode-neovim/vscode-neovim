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
      local wins = api.nvim_list_wins()
      for win in pairs(view_cache) do
        if not vim.tbl_contains(win, wins) then
          view_cache[win] = nil
        end
      end
    end,
  })
end

function M.setup()
  setup_viewport_changed()
end

return M
