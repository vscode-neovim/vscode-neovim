local api = require("vscode.api")

local default_optons = require("vscode.default-options")
local cursor = require("vscode.cursor")
local highlight = require("vscode.highlight")
local sync_options = require("vscode.sync-options")
local viewport = require("vscode.viewport")

default_optons.setup()
cursor.setup()
highlight.setup()
sync_options.setup()
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

  -- deprecated
  get_status_item = function()
    api.notify("Nvim statusline is now shown in vscode automatically. get_status_item was removed.")
    return {}
  end,
}

return vscode
