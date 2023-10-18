local api = vim.api

local vscode = require("vscode-neovim.api")
local util = require("vscode-neovim.util")

-- this module is responsible for creating multiple cursors, triggering a visual update, and displaying the fake visual cursor
local M = {}

-- ------------------------------ multi cursor ------------------------------ --
local multi_cursor_task

local function start_multi_cursor(right, skip_empty)
  multi_cursor_task = nil
  local mode = api.nvim_get_mode().mode
  local is_line = mode == "V"
  local is_block = mode == "\x16"
  if not is_line and not is_block then
    return
  end

  api.nvim_feedkeys(api.nvim_replace_termcodes("<ESC>" .. (right and "a" or "i"), true, true, true), "n", true)

  multi_cursor_task = function()
    multi_cursor_task = nil
    local ranges = {} ---@type lsp.Range[]
    local start_pos = api.nvim_buf_get_mark(0, "<") ---@type number[]
    local end_pos = api.nvim_buf_get_mark(0, ">") ---@type number[]
    for row = start_pos[1], end_pos[1] do
      local line = vim.fn.getline(row)
      local width = api.nvim_strwidth(line)
      if width == 0 and (skip_empty or is_block) then
      else
        local max_col = math.max(0, width - 1)
        -- (row, col) is (1, 0)-indexed
        local s_col, e_col
        if is_line then
          s_col = api.nvim_strwidth(line:match("^%s*") or "")
          e_col = max_col
        else
          e_col = math.min(max_col, end_pos[2])
          s_col = math.min(e_col, start_pos[2])
        end
        local range = vim.lsp.util.make_given_range_params({ row, s_col }, { row, e_col }, 0, "utf-16").range
        if right then
          range = { start = range["end"], ["end"] = range["end"] }
        else
          range = { start = range.start, ["end"] = range.start }
        end
        table.insert(ranges, range)
      end
    end
    if #ranges > 0 then
      vscode.action("start-multiple-cursors", { args = { ranges } })
    end
  end
end

function M.setup_multi_cursor(group)
  vim.api.nvim_create_autocmd({ "InsertEnter" }, {
    group = group,
    callback = function()
      if multi_cursor_task then
        vim.schedule(multi_cursor_task)
      end
    end,
  })

  -- Multiple cursors support for visual line/block modes
  vim.keymap.set("x", "ma", function()
    start_multi_cursor(true, true)
  end)
  vim.keymap.set("x", "mi", function()
    start_multi_cursor(false, true)
  end)
  vim.keymap.set("x", "mA", function()
    start_multi_cursor(true, false)
  end)
  vim.keymap.set("x", "mI", function()
    start_multi_cursor(false, false)
  end)
end

-- ----------------------- forced visual cursor updates ----------------------- --
function M.visual_changed()
  vim.fn.VSCodeExtensionNotify("visual-changed", vim.fn.win_getid())
end

function M.setup_visual_changed(group)
  -- simulate VisualChanged event to update visual selection
  vim.api.nvim_create_autocmd({ "ModeChanged" }, {
    group = group,
    pattern = "[vV\x16]*:[vV\x16]*",
    callback = M.visual_changed,
  })

  vim.api.nvim_create_autocmd({ "ModeChanged" }, {
    group = group,
    pattern = "[vV\x16]*:[^vv\x16]*",
    callback = M.visual_changed,
  })

  vim.api.nvim_create_autocmd({ "ModeChanged" }, {
    group = group,
    pattern = "[^vV\x16]*:[vV\x16]*",
    callback = M.visual_changed,
  })

  vim.api.nvim_create_autocmd({ "CursorHold", "TextChanged" }, {
    group = group,
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

function M.setup_fake_cursor(group)
  vim.api.nvim_create_autocmd({ "ModeChanged", "CursorMoved" }, {
    group = group,
    callback = M.highlight_fake_cursor,
  })
end

-- ------------------------------ setup ------------------------------ --
function M.setup()
  local group = vim.api.nvim_create_augroup("VSCodeCursorIntegration", { clear = true })
  M.setup_multi_cursor(group)
  M.setup_visual_changed(group)
  M.setup_fake_cursor(group)
end

return M
