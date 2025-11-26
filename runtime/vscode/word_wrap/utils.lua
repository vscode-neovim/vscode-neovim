-- TODO: add feat: capture previous keymap state to restore later after unsetting. aka my <leaderY/C/D keymaps
local M = {}

--- Register a list of keymaps.
-- @param km table list of mappings (each entry: {mode, lhs, rhs, opts})
function M.set_wrap_keymaps(km)
  if type(km) ~= "table" then
    vim.notify("set_wrap_keymaps: expected table, got " .. type(km), vim.log.levels.WARN)
    return
  end
  for _, m in ipairs(km) do
    local mode, lhs, rhs, opts = m[1], m[2], m[3], m[4]
    vim.keymap.set(mode, lhs, rhs, opts)
  end
end

--- Remove a list of keymaps. legacy since using vim.g.my_is_wrap to track state
-- @param km table list of mappings (each entry: {mode, lhs, rhs, opts})
function M.unset_wrap_keymaps(km)
  if type(km) ~= "table" then
    vim.notify("unset_wrap_keymaps: expected table, got " .. type(km), vim.log.levels.WARN)
    return
  end
  for _, m in ipairs(km) do
    local mode, lhs = m[1], m[2]
    pcall(vim.keymap.del, mode, lhs)
  end
end

---Word wrap modes.
---@alias WordWrapMode '"off"'|'"on"'|'"bounded"'|'"wordWrapColumn"'

---Get VSCode word wrap setting with info on whether wrapping is active.
---@return { mode: WordWrapMode|nil, enabled: boolean }
function M.get_vscode_wrap()
  local vscode = require("vscode")
  local mode = vscode.get_config("editor.wordWrap")
  local enabled = mode == "on" or mode == "bounded" or mode == "wordWrapColumn"
  return { mode = mode, enabled = enabled }
end

--- Return true when a macro is currently executing.
function M.is_macro_executing()
  return vim.fn.reg_executing() ~= ""
end

function M.is_macro_recording()
  return vim.fn.reg_recording() ~= ""
end

return M
