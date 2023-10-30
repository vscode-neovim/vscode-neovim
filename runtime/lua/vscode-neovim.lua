local api = require("vscode-neovim.api")

local default_optons = require("vscode-neovim.default-options")
local cursor = require("vscode-neovim.cursor")
local highlight = require("vscode-neovim.highlight")
local filetype = require("vscode-neovim.filetype")
local autocmds = require("vscode-neovim.autocmds")
local sync_options = require("vscode-neovim.sync-options")

default_optons.setup()
cursor.setup()
highlight.setup()
filetype.setup()
autocmds.setup()
sync_options.setup()

local vscode = {
  -- actions
  action = api.action,
  call = api.call,
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
  -- status item
  get_status_item = api.get_status_item,
}

return vscode
