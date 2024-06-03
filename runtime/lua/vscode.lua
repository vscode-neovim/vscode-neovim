local api = require("vscode.api")

local default_optons = require("vscode.default-options")
local force_options = require("vscode.force-options")
local sync_options = require("vscode.sync-options")
local cursor = require("vscode.cursor")
local highlight = require("vscode.highlight")
local viewport = require("vscode.viewport")

default_optons.setup()
force_options.setup()
sync_options.setup()
cursor.setup()
highlight.setup()
viewport.setup()

local vscode = {
  -- actions
  action = api.action,
  call = api.call,
  eval = api.eval,
  eval_async = api.eval_async,
  -- hooks
  on = api.on,
  -- vscode settings
  has_config = api.has_config,
  get_config = api.get_config,
  update_config = api.update_config,
  -- notifications
  notify = api.notify,
  -- operatorfunc helper
  to_op = api.to_op,
  -- utilities
  with_insert = api.with_insert,
}

-- Backward compatibility
package.loaded["vscode-neovim"] = vscode

return setmetatable(vscode, {
  __index = function(_, key)
    local msg = ([[The "vscode.%s" is missing. If you have a Lua module named "vscode", please rename it.]]):format(key)
    vscode.notify(msg, vim.log.levels.ERROR)
    return setmetatable({}, { __call = function() end })
  end,
})
