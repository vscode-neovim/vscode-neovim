local api = require("vscode.api")
local defaults = require("vscode.defaults")
local cursor = require("vscode.cursor")

local M = {}

M.notify = api.notify
M.call = api.call
M.notify_extension = api.notify_extension
M.call_extension = api.call_extension

M.setup = function()
    defaults.setup()
    cursor.setup()
end

return M
