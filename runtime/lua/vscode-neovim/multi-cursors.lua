local api = vim.api
local fn = vim.fn

---@class Position
---@field line integer
---@field character integer

---@class LspRange
---@field start Position
---@field end Position

---@class Cursor
---@field range LspRange
---@field extmarks number[] cursor hilight and range(selection) highlight

local CREATE_CURSOR_DEFER_TIME = 10
local START_DEFER_TIME = 40
local NOTIFY_DEFER_TIME = 20

local ns = api.nvim_create_namespace("vscode.multicursor")
local bufnr = 0 ---@type integer
local cursors = {} ---@type Cursor[]

local function set_hl()
  api.nvim_set_hl(0, "VSCodeCursor", { bg = "#177cb0", fg = "#ffffff", default = true })
  api.nvim_set_hl(0, "VSCodeCursorRange", { bg = "#48c0a3", fg = "#ffffff", default = true })
end

---@param start_row number
---@param start_col number
---@param end_row number
---@param end_col number
---@param is_cursor boolean
---@return number
local function set_extmark(start_row, start_col, end_row, end_col, is_cursor)
  return api.nvim_buf_set_extmark(bufnr, ns, start_row, start_col, {
    end_row = end_row,
    end_col = end_col,
    hl_group = is_cursor and "VSCodeCursor" or "VSCodeCursorRange",
    hl_mode = "replace",
    priority = is_cursor and 9999 or 9998,
  })
end

---@param start_row number
---@param start_col number
---@param end_row number
---@param end_col number
---@return number
local function hl_cursor(start_row, start_col, end_row, end_col)
  return set_extmark(start_row, start_col, end_row, end_col, true)
end

---@param start_row number
---@param start_col number
---@param end_row number
---@param end_col number
---@return number
local function hl_range(start_row, start_col, end_row, end_col)
  return set_extmark(start_row, start_col, end_row, end_col, false)
end

---@param extmarks number[]
local function del_extmarks(extmarks)
  for _, id in ipairs(extmarks) do
    api.nvim_buf_del_extmark(0, ns, id)
  end
end

---@param a Position
---@param b Position
---@return -1|0|1 -1 before, 0 equal, 1 after
local compare_position = function(a, b)
  if a.line > b.line then
    return 1
  end
  if a.line == b.line and a.character > b.character then
    return 1
  end
  if a.line == b.line and a.character == b.character then
    return 0
  end
  return -1
end

---@param p Position
---@param r LspRange
local position_in_range = function(p, r)
  return compare_position(p, r.start) >= 0 and compare_position(p, r["end"]) <= 0
end

---@param a LspRange
---@param b LspRange
---@return boolean
local function is_intersect(a, b)
  return position_in_range(a.start, b)
    or position_in_range(a["end"], b)
    or position_in_range(b.start, a)
    or position_in_range(b["end"], a)
end

---@param cursor Cursor
local function add_cursor(cursor)
  local ignore = false

  cursors = vim.tbl_filter(
    ---@param c Cursor
    function(c)
      if is_intersect(cursor.range, c.range) then
        ignore = true
        del_extmarks(c.extmarks)
        return false
      end
      return true
    end,
    cursors
  )

  if ignore then
    del_extmarks(cursor.extmarks)
  else
    table.insert(cursors, cursor)
  end

  table.sort(cursors, function(a, b)
    return compare_position(a.range.start, b.range.start) == -1
  end)
end

---@param cursor Cursor
local function goto_cursor(cursor)
  return api.nvim_win_set_cursor(0, {
    cursor.range.start.line + 1,
    cursor.range.start.character,
  })
end

local function reset()
  bufnr = api.nvim_get_current_buf()
  cursors = {}
  if bufnr then
    api.nvim_buf_clear_namespace(bufnr, ns, 0, -1)
  end
end

local function make_range(start_pos, end_pos)
  return vim.lsp.util.make_given_range_params(start_pos, end_pos, bufnr, "utf-16")
end

---@param motion_type 'char' | 'line' | 'block'
local function create_cursor(motion_type)
  local mode = api.nvim_get_mode().mode ---@type string
  if mode == "i" then
    return
  end
  local curbuf = api.nvim_get_current_buf()
  if curbuf ~= bufnr then
    reset()
  end

  if not motion_type then
    if mode == "n" then
      vim.go.operatorfunc = "v:lua.vscode_create_cursor"
      return "g@"
    elseif mode:lower() ~= "v" and mode ~= "\x16" then
      return
    end
  end

  api.nvim_input("<ESC>")

  vim.defer_fn(function()
    local _start_pos = api.nvim_buf_get_mark(0, motion_type and "[" or "<") ---@type number[]
    local _end_pos = api.nvim_buf_get_mark(0, motion_type and "]" or ">") ---@type number[]
    local select_type ---@type 'char'|'line'|'block'
    if motion_type then
      select_type = motion_type
    else
      if mode == "v" then
        select_type = "char"
      elseif mode == "V" then
        select_type = "line"
      elseif mode == "\x16" then
        select_type = "block"
      else
        return
      end
    end

    local start_pos, end_pos = _start_pos, _end_pos
    if _start_pos[1] > _end_pos[1] or (_start_pos[1] == _end_pos[1] and _start_pos[2] > _end_pos[2]) then
      start_pos, end_pos = _end_pos, _start_pos
    end

    if select_type == "char" then
      ---@type Cursor
      local cursor = {
        range = make_range(start_pos, end_pos).range,
        extmarks = {
          hl_cursor(end_pos[1] - 1, end_pos[2], end_pos[1] - 1, end_pos[2] + 1),
          hl_range(start_pos[1] - 1, start_pos[2], end_pos[1] - 1, end_pos[2] + 1),
        },
      }
      add_cursor(cursor)
    elseif select_type == "line" then
      for lnum = start_pos[1], end_pos[1] do
        local line = fn.getline(lnum)
        local line_width = api.nvim_strwidth(line)
        if line_width > 0 then
          ---@type Cursor
          local cursor = {
            range = make_range({ lnum, 0 }, { lnum, line_width - 1 }).range,
            extmarks = {
              hl_cursor(lnum - 1, line_width - 1, lnum - 1, line_width),
              hl_range(lnum - 1, 0, lnum - 1, line_width),
            },
          }
          add_cursor(cursor)
        end
      end
    elseif select_type == "block" then
      local start_col = start_pos[2]
      local end_col = end_pos[2]
      for lnum = start_pos[1], end_pos[1] do
        local line = fn.getline(lnum)
        local line_width = api.nvim_strwidth(line)
        if line_width > 0 then
          local safe_end_col = math.min(line_width - 1, end_col) -- zero indexed
          ---@type Cursor
          local cursor = {
            range = make_range({ lnum, start_col }, { lnum, safe_end_col }).range,
            extmarks = {
              hl_cursor(lnum - 1, safe_end_col, lnum - 1, safe_end_col + 1),
              hl_range(lnum - 1, start_col, lnum - 1, safe_end_col + 1),
            },
          }
          add_cursor(cursor)
        end
      end
    end
  end, CREATE_CURSOR_DEFER_TIME)
end

---@param right boolean
local function start(right)
  local mode = api.nvim_get_mode().mode
  local creating
  if mode:lower() == "v" or mode == "\x16" then
    creating = true
    create_cursor()
  end

  if not vim.g.vscode then
    return
  end

  vim.defer_fn(function()
    if #cursors <= 0 then
      return
    end
    local ranges = vim.tbl_map(
      ---@param c Cursor
      ---@return LspRange[]
      function(c)
        local s = c.range.start
        local e = c.range["end"]
        if s.line == e.line and e.character - s.character == 1 then
          return right and { start = e, ["end"] = e } or { start = s, ["end"] = s }
        end
        return c.range
      end,
      cursors
    )
    goto_cursor(cursors[1])
    api.nvim_input("<ESC>" .. (right and "a" or "i"))
    vim.defer_fn(function()
      fn.VSCodeExtensionNotify("start-cursors", ranges)
    end, NOTIFY_DEFER_TIME)
  end, creating and START_DEFER_TIME or 0)
end

---@param direction -1|1 -1 previous, 1 next
local function navigate(direction)
  if #cursors == 0 then
    return
  end
  if #cursors == 1 then
    goto_cursor(cursors[1])
  end

  local _cursor = api.nvim_win_get_cursor(0)
  ---@type Position
  local curr_pos = { line = _cursor[1] - 1, character = _cursor[2] }
  ---@type Cursor
  local cursor
  if direction == -1 then
    cursor = cursors[#cursors]
    for i = #cursors, 1, -1 do
      if compare_position(cursors[i].range["end"], curr_pos) == -1 then
        cursor = cursors[i]
        break
      end
    end
  else
    cursor = cursors[1]
    for i = 1, #cursors do
      if compare_position(cursors[i].range.start, curr_pos) == 1 then
        cursor = cursors[i]
        break
      end
    end
  end
  goto_cursor(cursor)
end

local function cancel()
  reset()
end
local function start_left()
  start(false)
end
local function start_right()
  start(true)
end
local function prev_cursor()
  navigate(-1)
end
local function next_cursor()
  navigate(1)
end

----- Auto Commands -----
local group = api.nvim_create_augroup("vscode-multiple-cursors", {})
api.nvim_create_autocmd({ "VimEnter", "ColorScheme" }, { callback = set_hl, group = group })
api.nvim_create_autocmd({ "TextChanged", "TextChangedI", "InsertEnter" }, { callback = reset, group = group })
api.nvim_create_autocmd({ "WinEnter", "BufEnter", "BufWinEnter" }, {
  callback = function()
    if api.nvim_get_current_buf() ~= bufnr then
      reset()
    end
  end,
  group = group,
})
----- Default Keymaps ----
vim.keymap.set({ "n", "x" }, "mc", create_cursor, { expr = true, desc = "Create cursor" })
vim.keymap.set({ "n" }, "mcc", cancel, { desc = "Cancel/Clear all cursors" })
vim.keymap.set({ "n", "x" }, "mi", start_left, { desc = "Start cursors on the left" })
vim.keymap.set({ "n", "x" }, "ma", start_right, { desc = "Start cursors on the right" })
vim.keymap.set({ "n" }, "[mc", prev_cursor, { desc = "Goto prev cursor" })
vim.keymap.set({ "n" }, "]mc", next_cursor, { desc = "Goto next cursor" })

_G.vscode_create_cursor = create_cursor

set_hl()

return {
  create_cursor = create_cursor,
  cancel = cancel,
  start_left = start_left,
  start_right = start_right,
  prev_cursor = prev_cursor,
  next_cursor = next_cursor,
}
