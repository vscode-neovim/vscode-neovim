-- used to execute vscode command
local command_event_name = 'vscode-command'
-- used for extension communications
local plugin_event_name = 'vscode-neovim'

local M = {}

M.notify = function(command, ...)
    return vim.rpcnotify(vim.g.vscode_channel, command_event_name, command, { ... })
end

M.call = function(command, ...)
    return vim.rpcrequest(vim.g.vscode_channel, command_event_name, command, { ... })
end

M.notify_extension = function(command, ...)
    return vim.rpcnotify(vim.g.vscode_channel, plugin_event_name, command, { ... })
end

M.call_extension = function(command, ...)
    return vim.rpcrequest(vim.g.vscode_channel, plugin_event_name, command, { ... })
end

return M
