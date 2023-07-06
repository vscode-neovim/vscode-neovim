util = require("util")

-- make cursor visible for plugins what use fake cursor
vim.api.nvim_set_hl(0, 'Cursor', { reverse = true })

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

-- simulate VisualChanged event (hopefully will be added soon)
local function send_visual_changed()
  local anchor = vim.fn.getpos("v")
  local anchor_line = anchor[2] - 1
  local anchor_col = anchor[3] - 1
  local active = vim.fn.getpos(".")
  local active_line = active[2] - 1
  local active_col = active[3] - 1
  vim.fn.VSCodeExtensionNotify('visual-changed', vim.fn.win_getid(), vim.fn.mode(), anchor_line, anchor_col,
    active_line, active_col)
end

vim.api.nvim_create_autocmd({ "CursorMoved" }, {
  callback = function()
    if util.is_visual_mode() then
      send_visual_changed()
    end
  end
})

vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  pattern = "[vV\x16]*:[^vv\x16]*",
  callback =
      send_visual_changed
})

vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  pattern = "[vV\x16]*:[vV\x16]*",
  callback =
      send_visual_changed
})
