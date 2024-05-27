local api, fn = vim.api, vim.fn

local vscode = require("vscode.api")
local util = require("vscode.util")

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
      if #line == 0 and (skip_empty or is_block) then
      else
        -- (row, col) is (1, 0)-indexed
        local s_col, e_col
        if is_line then
          s_col = #(line:match("^%s*") or "")
          e_col = #line
        else
          e_col = math.min(#line, end_pos[2])
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
function M.setup_visual_changed(group)
  -- Simulate VisualChanged event
  -- TODO: https://github.com/neovim/neovim/issues/19708
  local visual_ns = api.nvim_create_namespace("vscode.visual.changed")

  local is_visual, last_visual_pos, last_curr_pos

  local function fire_visual_changed()
    fn.VSCodeExtensionNotify("visual-changed", api.nvim_get_current_win())
  end

  api.nvim_create_autocmd({ "ModeChanged" }, {
    group = group,
    callback = function(ev)
      local mode = api.nvim_get_mode().mode
      -- save current mode
      is_visual = mode:match("[vV\x16]")
      -- handle mode changes
      if ev.match:match("[vV\x16]") then
        last_visual_pos = fn.getpos("v")
        last_curr_pos = fn.getpos(".")
        fire_visual_changed()
      end
    end,
  })

  api.nvim_set_decoration_provider(visual_ns, {
    on_win = function()
      if is_visual then
        local visual_pos = fn.getpos("v")
        local curr_pos = fn.getpos(".")
        if not (vim.deep_equal(visual_pos, last_visual_pos) and vim.deep_equal(curr_pos, last_curr_pos)) then
          last_visual_pos = visual_pos
          last_curr_pos = curr_pos
          fire_visual_changed()
        end
      end
    end,
  })
end

-- --------------------------- fake visual cursor --------------------------- --
-- in visual mode, decorate a fake cursor so that vscode can use the primary cursor for selection
local fake_cursor_ns = api.nvim_create_namespace("vscode.fake-visual-cursor")
local fake_cursor = nil
local function highlight_fake_cursor()
  if fake_cursor then
    fake_cursor = nil
    for _, buf in ipairs(api.nvim_list_bufs()) do
      api.nvim_buf_clear_namespace(buf, fake_cursor_ns, 0, -1)
    end
  end
  if util.is_visual_mode() then
    local line = vim.fn.line(".")
    local col = vim.fn.col(".")
    local ch = util.get_char_at(line, col) or " "
    fake_cursor = api.nvim_buf_set_extmark(0, fake_cursor_ns, line - 1, col - 1, {
      virt_text = { { ch, "Cursor" } },
      virt_text_pos = "overlay",
      priority = 65534,
    })
  end
end

function M.setup_fake_cursor(group)
  api.nvim_create_autocmd({ "ModeChanged", "CursorMoved" }, {
    group = group,
    callback = highlight_fake_cursor,
  })
end

-- ------------------------------ setup ------------------------------ --
function M.setup()
  local group = vim.api.nvim_create_augroup("vscode.cursor", { clear = true })
  M.setup_multi_cursor(group)
  M.setup_visual_changed(group)
  M.setup_fake_cursor(group)
end

return M
