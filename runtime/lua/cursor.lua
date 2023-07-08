local util = require("util")

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

-- trigger a cursor update
local function update_cursor()
  vim.fn.VSCodeExtensionNotify('update-cursor', vim.fn.win_getid())
end

-- simulate VisualChanged event
vim.api.nvim_create_autocmd({ "CursorHold", "TextChanged" }, {
  callback = function()
    if util.is_visual_mode() then
      update_cursor()
    end
  end
})

-- always update the cursor on modechange
vim.api.nvim_create_autocmd({ "ModeChanged" }, {
  callback = update_cursor
})
