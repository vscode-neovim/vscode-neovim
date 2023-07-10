local util = require("util")

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
  should_notify_multi_cursor = nil
  local startPos = vim.fn.getcharpos("'<")
  local endPos = vim.fn.getcharpos("'>")
  vim.fn.VSCodeExtensionNotify('visual-edit', multi_cursor_append, multi_cursor_visual_mode, startPos[2], endPos[2],
    startPos[3], endPos[3], multi_cursor_skip_empty)
end

-- Multiple cursors support for visual line/block modes
vim.keymap.set('x', 'ma', function() prepare_multi_cursor(true, true) end)
vim.keymap.set('x', 'mi', function() prepare_multi_cursor(false, true) end)
vim.keymap.set('x', 'mA', function() prepare_multi_cursor(true, false) end)
vim.keymap.set('x', 'mI', function() prepare_multi_cursor(false, false) end)

-- ----------------------- forced cursor updates ----------------------- --
-- on certain events, we want to trigger a cursor update
local function update_cursor()
  vim.fn.VSCodeExtensionNotify('update-cursor', vim.fn.win_getid())

  -- notify a multi cursor only after the cursor is updated
  if should_notify_multi_cursor and vim.fn.mode() == 'i' then
    notify_multi_cursor()
  end
end

-- always update the cursor on modechange, to resolve mode change cursor update promise
-- ensure that modemanager is updated first
vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  callback = function()
    vim.fn.VSCodeExtensionNotify('mode-changed', vim.v.event.new_mode)
    update_cursor()
  end
})

-- simulate VisualChanged event to update visual selection
vim.api.nvim_create_autocmd({ "CursorHold", "TextChanged" }, {
  callback = function()
    if util.is_visual_mode() then
      update_cursor()
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
