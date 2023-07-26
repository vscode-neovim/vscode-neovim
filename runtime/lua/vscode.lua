local api = require("vscode.api")
local defaults = require("vscode.defaults")
local cursor = require("vscode.cursor")

local M = {}

M.notify = api.notify
M.call = api.call

M.setup = function()
    defaults.setup()
    cursor.setup()
end

return M
