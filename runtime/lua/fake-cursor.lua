util = require("util")

-- in visual mode, decorate a fake cursor so that vscode can use the primary cursor for selection
local ns = vim.api.nvim_create_namespace("vscode-fake-visual-cursor")
local cursor = nil

local function highlight_cursor()
  if (cursor) then
    vim.api.nvim_buf_del_extmark(0, ns, cursor)
  end
  if util.is_visual_mode() then
    local line = vim.fn.line(".")
    local col = vim.fn.col(".")
    local ch = util.get_char_at(line, col) or " "
    cursor = vim.api.nvim_buf_set_extmark(0, ns, line - 1, col - 1,
      { virt_text = { { ch, "Cursor" } }, virt_text_pos = "overlay", hl_mode = "combine", priority = 65534 })
  end
end

vim.api.nvim_create_autocmd({ "ModeChanged", "CursorMoved" }, {
  callback = highlight_cursor
})

local function process_cursor_event(event, is_visual_mode_update)
  local mode = vim.api.nvim_get_mode()

  if event == "ModeChanged" then
    vim.fn.VSCodeExtensionNotify('mode-changed', mode)
  end

  if event == "CursorMoved" or ((event == "ModeChanged" or event == "TextChanged" or event == "CursorHold") and is_visual_mode_update) then
    local anchor = vim.fn.getpos("v")
    local anchor_line = anchor[2] - 1
    local anchor_col = anchor[3] - 1
    local active = vim.fn.getpos(".")
    local active_line = active[2] - 1
    local active_col = active[3] - 1
    vim.fn.VSCodeExtensionNotify('cursor-moved', vim.api.nvim_get_current_win(), anchor_line, anchor_col,
      active_line, active_col)
  end
end

vim.api.nvim_create_autocmd({ "CursorMoved", "CursorHold", "TextChanged" }, {
  callback = function(ev)
    process_cursor_event(ev.event)
  end
})

vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  pattern = "[vV\x16]*:[^vv\x16]*",
  callback =
      function(ev)
        process_cursor_event(ev.event, true)
      end
})

vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  pattern = "[^vV\x16]*:[vV\x16]*",
  callback =
      function(ev)
        process_cursor_event(ev.event, true)
      end
})

vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  pattern = "[vV\x16]*:[vV\x16]*",
  callback =
      function(ev)
        process_cursor_event(ev.event, true)
      end
})

vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  pattern = "[^vV\x16]*:[^vV\x16]*",
  callback =
      function(ev)
        process_cursor_event(ev.event, false)
      end
})
