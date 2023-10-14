local api = require("vscode-neovim.api")

require("vscode-neovim.default-options")
require("vscode-neovim.cursor")
require("vscode-neovim.highlight")
require("vscode-neovim.filetype")
require("vscode-neovim.numbers")
require("vscode-neovim.autocmds")

local vscode = {
  action = api.action,
  call = api.call,
  on = api.on,
  has_config = api.has_config,
  get_config = api.get_config,
  update_config = api.update_config,
}

_G._vscode = vscode

return vscode
