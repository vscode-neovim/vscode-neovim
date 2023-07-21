local util = require("vscode.util")

-- ------------------------------ multi cursor ------------------------------ --
local should_notify_multi_cursor = nil
local multi_cursor_visual_mode = nil
local multi_cursor_append = nil
local multi_cursor_skip_empty = nil

local function prepare_multi_cursor(append, skip_empty)
  local m = vim.fn.mode()
  if m == 'V' or m == "\x16" then
    should_notify_multi_cursor = true
    multi_cursor_visual_mode = m
    multi_cursor_append = append
    multi_cursor_skip_empty = skip_empty
    -- We need to start insert, then spawn cursors otherwise they'll be destroyed
    -- using feedkeys() here because :startinsert is being delayed
    vim.cmd [[ call feedkeys("\<Esc>i", 'n') ]]
  end
end

local function notify_multi_cursor()
  if not should_notify_multi_cursor then
    return
  end
  should_notify_multi_cursor = nil
  local startPos = vim.fn.getcharpos("'<")
  local endPos = vim.fn.getcharpos("'>")
  vim.fn.VSCodeExtensionNotify('visual-edit', multi_cursor_append, multi_cursor_visual_mode, startPos[2], endPos[2],
    startPos[3], endPos[3], multi_cursor_skip_empty)
end

vim.api.nvim_create_autocmd({ "InsertEnter" }, {
  callback = notify_multi_cursor
})

-- Multiple cursors support for visual line/block modes
vim.keymap.set('x', 'ma', function() prepare_multi_cursor(true, true) end)
vim.keymap.set('x', 'mi', function() prepare_multi_cursor(false, true) end)
vim.keymap.set('x', 'mA', function() prepare_multi_cursor(true, false) end)
vim.keymap.set('x', 'mI', function() prepare_multi_cursor(false, false) end)

-- ----------------------- forced visual cursor updates ----------------------- --
local function visual_changed()
  vim.fn.VSCodeExtensionNotify('visual-changed', vim.fn.win_getid())
end

-- simulate VisualChanged event to update visual selection
vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  pattern = "[vV\x16]*:[vV\x16]*",
  callback = visual_changed
})

vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  pattern = "[vV\x16]*:[^vv\x16]*",
  callback = visual_changed
})

vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  pattern = "[^vV\x16]*:[vV\x16]*",
  callback = visual_changed
})

vim.api.nvim_create_autocmd({ "CursorHold", "TextChanged" }, {
  callback = function()
    if util.is_visual_mode() then
      visual_changed()
    end
  end
})

-- --------------------------- fake visual cursor --------------------------- --
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
