local api = require("vscode-neovim.api")
local defaults = require("vscode-neovim.defaults")
local cursor = require("vscode-neovim.cursor")

local M = {}

M.notify = api.notify
M.call = api.call

M.setup = function()
    defaults.setup()
    cursor.setup()
end

return M
