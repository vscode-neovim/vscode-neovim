local api = require("vscode-neovim.api")

local default_optons = require("vscode-neovim.default-options")
local cursor = require("vscode-neovim.cursor")
local highlight = require("vscode-neovim.highlight")
local filetype = require("vscode-neovim.filetype")
local numbers = require("vscode-neovim.numbers")
local autocmds = require("vscode-neovim.autocmds")

default_optons.setup()
cursor.setup()
highlight.setup()
filetype.setup()
numbers.setup()
autocmds.setup()

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
  notify_once = api.notify_once,
}

return vscode
