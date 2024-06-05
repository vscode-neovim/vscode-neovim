local api = vim.api
local vscode = require("vscode.api")

local M = {}

function collect_file_info(event)
  return {
    buf = event.buf,
    path = event.file,
  }
end

function M.setup()
  api.nvim_create_autocmd({ "BufWriteCmd" }, {
    pattern = "*",
    callback = function(event)
      local info = collect_file_info(event)
      vscode.action("save_buf", { args = { info.buf, info.path } })
    end,
  })
end

return M
