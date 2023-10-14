--- Synchronize Line Number Style ---
local M = {}

local api = vim.api

local check_number = (function()
  local function _check_number()
    local number, relativenumber = vim.wo.number, vim.wo.relativenumber
    if vim.w.vscode_number ~= number or vim.w.vscode_relativenumber ~= relativenumber then
      vim.w.vscode_number = number
      vim.w.vscode_relativenumber = relativenumber
      local style = "off"
      if number then
        style = "on"
      end
      if relativenumber then
        style = "relative"
      end
      vim.fn.VSCodeExtensionNotify("change-number", api.nvim_get_current_win(), style)
    end
  end
  local check_timer
  return function()
    if check_timer and check_timer:is_active() then
      check_timer:close()
    end
    check_timer = vim.defer_fn(_check_number, 10)
  end
end)()

function M.setup()
  api.nvim_create_autocmd("OptionSet", {
    pattern = { "number", "relativenumber" },
    callback = check_number,
  })

  api.nvim_create_autocmd({
    "CursorMoved",
    "BufLeave",
    "BufEnter",
    "InsertLeave",
    "InsertEnter",
  }, {
    callback = function()
      if not vim.b.vscode_loaded_default_number then
        vim.wo.number = not not vim.b.vscode_number
        vim.wo.relativenumber = not not vim.b.vscode_relativenumber
        ---@diagnostic disable-next-line: inject-field
        vim.b.vscode_loaded_default_number = true
      else
        check_number()
      end
    end,
  })
end

return M
