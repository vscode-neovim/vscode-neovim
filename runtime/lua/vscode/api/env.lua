local code = require("vscode.api")

---@class Clipboard
---@field readText fun(): string
---@field writeText fun(value: string)

---@class Env
---@field appHost string
---@field appName string
---@field appRoot string
---@field isNewAppInstall boolean
---@field isTelemetryEnabled boolean
---@field language string
---@field logLevel "Off"|"Trace"|"Debug"|"Info"|"Warning"|"Error"
---@field machineId string
---@field remoteName string|nil
---@field sessionId string
---@field shell string
---@field uiKind "Desktop"|"Web"
---@field uriScheme string
---@field clipboard Clipboard
local M = {}

M.clipboard = {
  readText = function()
    return code.eval("return await vscode.env.clipboard.readText()")
  end,
  writeText = function(value)
    code.eval("await vscode.env.clipboard.writeText(args)", { args = value })
  end,
}

local function index(_, k)
  if M[k] == nil or k == "logLevel" or k == "uiKind" or k == "shell" then
    local fields = code.eval([[
        return {
            appHost: vscode.env.appHost,
            appName: vscode.env.appName,
            appRoot: vscode.env.appRoot,
            isNewAppInstall: vscode.env.isNewAppInstall,
            isTelemetryEnabled: vscode.env.isTelemetryEnabled,
            language: vscode.env.language,
            logLevel: vscode.LogLevel[vscode.env.logLevel],
            machineId: vscode.env.machineId,
            remoteName: vscode.env.remoteName,
            sessionId: vscode.env.sessionId,
            shell: vscode.env.shell,
            uiKind: vscode.UIKind[vscode.env.uiKind],
            uriScheme: vscode.env.uriScheme,
        };
  ]])

    M = vim.tbl_extend("force", M, fields)
  end

  return M[k]
end

---@type Env
return setmetatable({}, { __index = index, __newindex = function() end })
