local M = {}

local api, fn = vim.api, vim.fn

M.event_group = api.nvim_create_augroup("vscode.viewport", { clear = true })
M.viewport_changed_ns = api.nvim_create_namespace("vscode.viewport.changed")

---@class WinView All positions are 0-based
---@field winid integer
---@field bufnr integer
---@field lnum integer
---@field col integer
---@field coladd integer
---@field curswant integer
---@field topline integer
---@field botline integer
---@field topfill integer
---@field leftcol integer
---@field skipcol integer

local function setup_viewport_changed()
  ---@type table<integer, WinView>
  local view_cache = {}

  api.nvim_set_decoration_provider(M.viewport_changed_ns, {
    on_win = function(_, win, buf, topline, botline)
      -- We don't need the first window.
      if win == 1000 then
        return
      end
      ---@type WinView
      local view = api.nvim_win_call(win, fn.winsaveview)
      view.winid = win
      view.bufnr = buf
      view.topline = topline
      view.botline = botline
      view.lnum = view.lnum - 1

      local cache = view_cache[view.winid]
      if cache and vim.deep_equal(view, cache) then
        return
      end
      view_cache[view.winid] = view

      --#region XXX: Temporary fix for #2165
      -- Avoid unnecessary notifications
      -- For highlighting #1976
      local leftcol_changed = cache and cache.leftcol ~= view.leftcol
      -- For highlighting #2194
      local topline_changed = cache and cache.topline ~= view.topline
      -- For cursor position #1971
      local cursor_changed = cache
        and (cache.lnum ~= view.lnum or cache.col ~= cache.col)
        and api.nvim_get_mode().mode == "c"
      if not leftcol_changed and not cursor_changed and not topline_changed then
        return
      end
      --#endregion

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
