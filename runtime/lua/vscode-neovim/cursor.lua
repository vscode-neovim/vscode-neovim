local util = require("vscode-neovim.util")
local api = require("vscode-neovim.api")

-- this module is responsible for creating multiple cursors, triggering a visual update, and displaying the fake visual cursor
local M = {}

-- ------------------------------ multi cursor ------------------------------ --
M.should_notify_multi_cursor = nil
M.multi_cursor_visual_mode = nil
M.multi_cursor_append = nil
M.multi_cursor_skip_empty = nil

function M.prepare_multi_cursor(append, skip_empty)
  local m = vim.fn.mode()
  if m == "V" or m == "\x16" then
    M.should_notify_multi_cursor = true
    M.multi_cursor_visual_mode = m
    M.multi_cursor_append = append
    M.multi_cursor_skip_empty = skip_empty
    -- We need to start insert, then spawn cursors otherwise they'll be destroyed
    -- using feedkeys() here because :startinsert is being delayed
    vim.cmd([[ call feedkeys("\<Esc>i", 'n') ]])
  end
end

function M.notify_multi_cursor()
  if not M.should_notify_multi_cursor then
    return
  end
  M.should_notify_multi_cursor = nil
  local startPos = vim.fn.getcharpos("'<")
  local endPos = vim.fn.getcharpos("'>")
  api.notify_extension(
    "visual-edit",
    M.multi_cursor_append,
    M.multi_cursor_visual_mode,
    startPos[2],
    endPos[2],
    startPos[3],
    endPos[3],
    M.multi_cursor_skip_empty
  )
end

function M.setup_multi_cursor()
  vim.api.nvim_create_autocmd({ "InsertEnter" }, {
    callback = M.notify_multi_cursor,
  })

  -- Multiple cursors support for visual line/block modes
  vim.keymap.set("x", "ma", function()
    M.prepare_multi_cursor(true, true)
  end)
  vim.keymap.set("x", "mi", function()
    M.prepare_multi_cursor(false, true)
  end)
  vim.keymap.set("x", "mA", function()
    M.prepare_multi_cursor(true, false)
  end)
  vim.keymap.set("x", "mI", function()
    M.prepare_multi_cursor(false, false)
  end)
end

-- ----------------------- forced visual cursor updates ----------------------- --
function M.visual_changed()
  api.notify_extension("visual-changed", vim.fn.win_getid())
end

function M.setup_visual_changed()
  -- simulate VisualChanged event to update visual selection
  vim.api.nvim_create_autocmd({ "ModeChanged" }, {
    pattern = "[vV\x16]*:[vV\x16]*",
    callback = M.visual_changed,
  })

  vim.api.nvim_create_autocmd({ "ModeChanged" }, {
    pattern = "[vV\x16]*:[^vv\x16]*",
    callback = M.visual_changed,
  })

  vim.api.nvim_create_autocmd({ "ModeChanged" }, {
    pattern = "[^vV\x16]*:[vV\x16]*",
    callback = M.visual_changed,
  })

  vim.api.nvim_create_autocmd({ "CursorHold", "TextChanged" }, {
    callback = function()
      if util.is_visual_mode() then
        M.visual_changed()
      end
    end,
  })
end

-- --------------------------- fake visual cursor --------------------------- --
-- in visual mode, decorate a fake cursor so that vscode can use the primary cursor for selection
M.fake_ns = vim.api.nvim_create_namespace("vscode-fake-visual-cursor")
M.fake_cursor = nil

function M.highlight_fake_cursor()
  if M.fake_cursor then
    vim.api.nvim_buf_del_extmark(0, M.fake_ns, M.fake_cursor)
  end
  if util.is_visual_mode() then
    local line = vim.fn.line(".")
    local col = vim.fn.col(".")
    local ch = util.get_char_at(line, col) or " "
    M.fake_cursor = vim.api.nvim_buf_set_extmark(
      0,
      M.fake_ns,
      line - 1,
      col - 1,
      { virt_text = { { ch, "Cursor" } }, virt_text_pos = "overlay", hl_mode = "replace", priority = 65534 }
    )
  end
end

function M.setup_fake_cursor()
  vim.api.nvim_create_autocmd({ "ModeChanged", "CursorMoved" }, {
    callback = M.highlight_fake_cursor,
  })
end

-- ------------------------------ setup ------------------------------ --
function M.setup()
  M.setup_multi_cursor()
  M.setup_visual_changed()
  M.setup_fake_cursor()
end

return M
