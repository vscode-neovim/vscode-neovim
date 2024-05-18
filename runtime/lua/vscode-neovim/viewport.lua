local M = {}

local api, fn = vim.api, vim.fn

M.event_group = api.nvim_create_augroup("vscode-neovim.viewport", { clear = true })
M.viewport_changed_ns = api.nvim_create_namespace("vscode-neovim.viewport.changed")

---@class WinContext
---@field textoff integer
---@field topline integer
---@field botline integer
---@field width integer
---@field height integer
---@field leftcol integer
----@field winnr integer Don't use this
---@field winid integer

---@return WinContext
local function get_win_context()
  local info = fn.getwininfo(api.nvim_get_current_win())[1]
  local view = fn.winsaveview()
  return vim.tbl_extend("force", info, view)
end

local function setup_viewport_changed()
  ---@type table<integer, WinContext>
  local ctx_cache = {}

  api.nvim_set_decoration_provider(M.viewport_changed_ns, {
    on_win = function()
      local ctx = get_win_context()
      local cache = ctx_cache[ctx.winid]
      if cache and vim.deep_equal(ctx, cache) then
        return
      end
      ctx_cache[ctx.winid] = ctx
      fn.VSCodeExtensionNotify("viewport-changed", ctx)
    end,
  })

  -- cleanup cache
  api.nvim_create_autocmd({ "WinClosed" }, {
    group = M.event_group,
    callback = function()
      local wins = api.nvim_list_wins()
      for win in pairs(ctx_cache) do
        if not vim.tbl_contains(win, wins) then
          ctx_cache[win] = nil
        end
      end
    end,
  })
end

function M.setup()
  setup_viewport_changed()
end

return M
