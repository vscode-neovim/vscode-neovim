--- Shim vim.lsp.buf calls to vscode equivalent commands.

local vscode = require("vscode")

local M = {}

local map = {
  hover = "editor.action.showHover",
  declaration = "editor.action.peekDeclaration",
  definition = "editor.action.peekDefinition",
  type_definition = "editor.action.peekTypeDefinition",
  implementation = "editor.action.peekImplementation",
  signature_help = "editor.action.triggerParameterHints",
  completion = "editor.action.triggerSuggest",
  format = "editor.action.formatDocument",
  rename = "editor.action.rename",
  references = "editor.action.referenceSearch.trigger",
  document_symbol = "workbench.action.gotoSymbol",
  incoming_calls = "editor.showIncomingCalls",
  outgoing_calls = "editor.showOutgoingCalls",
  ---@param kind "subtypes"|"supertypes"
  typehierarchy = function(kind)
    local cmd
    if kind == "subtypes" then
      cmd = "editor.showSubtypes"
    elseif kind == "supertypes" then
      cmd = "editor.showSupertypes"
    else
      cmd = "editor.showTypeHierarchy"
    end
    vscode.action(cmd)
  end,
  list_workspace_folders = function()
    return vscode.eval("return (vscode.workspace.workspaceFolders || []).map((folder) => folder.name);")
  end,
  add_workspace_folder = "workbench.action.addRootFolder",
  remove_workspace_folder = "workbench.action.removeRootFolder",
  workspace_symbol = function(query)
    vscode.action("workbench.action.quickOpen", { args = { "#" .. (query or "") } })
  end,
  document_highlight = "editor.action.wordHighlight.trigger",
  clear_references = vim.NIL,
  code_action = "editor.action.sourceAction",
  execute_command = vim.NIL,
}

for method, cmd in pairs(map) do
  local cmd_type = type(cmd)

  if cmd == vim.NIL then
    M[method] = function()
      vscode.notify(string.format("vim.lsp.buf.%s is not supported in vscode.", method), vim.log.levels.WARN)
    end
  elseif cmd_type == "string" then
    M[method] = function()
      vscode.action(cmd)
    end
  elseif cmd_type == "function" then
    M[method] = cmd
  end
end

vim.lsp.buf = setmetatable(M, {
  __index = function(t, method)
    t[method] = function()
      vscode.notify(
        string.format(
          "vim.lsp.buf.%s is not handled by vscode-neovim. %s",
          method,
          "Please report this issue at [vscode-neovim](https://github.com/vscode-neovim/vscode-neovim/issues)"
        ),
        vim.log.levels.WARN
      )
    end
    return t[method]
  end,
})
