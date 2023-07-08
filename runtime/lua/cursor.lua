local util = require("util")

-- in visual mode, decorate a fake cursor so that vscode can use the primary cursor for selection
local ns = vim.api.nvim_create_namespace("vscode-fake-visual-cursor")
local cursor = nil

local function process_cursor_event(event)
  local mode = vim.api.nvim_get_mode().mode
  local anchor = vim.fn.getpos("v")
  local anchor_line = anchor[2] - 1
  local anchor_col = anchor[3] - 1
  local active = vim.fn.getpos(".")
  local active_line = active[2] - 1
  local active_col = active[3] - 1

  if event == "ModeChanged" then
    vim.fn.VSCodeExtensionNotify('mode-changed', mode)
  end

  if event == "CursorMoved" or event == "CursorMovedI" or event == "ModeChanged" or ((event == "TextChanged" or event == "CursorHold") and util.is_visual_mode()) then
    vim.fn.VSCodeExtensionNotify('cursor-moved', vim.api.nvim_get_current_win(), anchor_line, anchor_col,
      active_line, active_col)
  end

  if (cursor) then
    vim.api.nvim_buf_del_extmark(0, ns, cursor)
  end
  if util.is_visual_mode() then
    local ch = util.get_char_at(active_line + 1, active_col + 1) or " "
    cursor = vim.api.nvim_buf_set_extmark(0, ns, active_line, active_col,
      { virt_text = { { ch, "Cursor" } }, virt_text_pos = "overlay", hl_mode = "combine", priority = 65534 })
  end
end

vim.api.nvim_create_autocmd({ "ModeChanged", "CursorMoved", "CursorMovedI", "CursorHold", "TextChanged" }, {
  callback = function(ev)
    process_cursor_event(ev.event)
  end
})
