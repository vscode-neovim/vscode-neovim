local util = require("vscode-neovim.util")
local api = require("vscode-neovim.api")

local M = {}

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
  M.setup_visual_changed()
  M.setup_fake_cursor()
end

return M
