local api = vim.api
local NS = api.nvim_create_namespace("vscode.highlight")

local M = {}

function dump(o)
  if type(o) == "table" then
    local s = "{ "
    for k, v in pairs(o) do
      if type(k) ~= "number" then
        k = '"' .. k .. '"'
      end
      s = s .. "[" .. k .. "] = " .. dump(v) .. ","
    end
    return s .. "} "
  else
    return tostring(o)
  end
end

function M.set_diagnostics(bufnr, diagnostics)
  local vim_diagnostics = {}
  for _i, diagnostic in pairs(diagnostics) do
    table.insert(vim_diagnostics, {
      col = 0,
      lnum = diagnostic.line,
      severity = diagnostic.severity,
      message = diagnostic.message,
    })
  end

  vim.diagnostic.set(NS, bufnr, vim_diagnostics)
end

return M
