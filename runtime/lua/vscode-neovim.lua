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
}

return vscode
