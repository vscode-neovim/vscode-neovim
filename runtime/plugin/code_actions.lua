local vscode = require("vscode-neovim")

local k = function(mode, lhs, rhs)
  vim.keymap.set(mode, lhs, rhs, { expr = true }) -- expr is required
end

------------
-- Format --
------------
local format = vscode.to_op(function(range)
  vscode.action("editor.action.formatSelection", { range = range })
end)

k({ "n", "x" }, "=", format)
k({ "n" }, "==", function()
  return format() .. "_"
end)

-------------
-- Comment --
-------------
local comment = vscode.to_op(function(range, type)
  local cmd
  if type == "line" then
    cmd = "editor.action.commentLine"
  else
    cmd = "editor.action.blockComment"
  end
  vscode.action(cmd, { range = range })
end)

local comment_line = function()
  return comment() .. "_"
end

k({ "n", "x" }, "gc", comment)
k({ "n" }, "gcc", comment_line)
k({ "x" }, "<C-/>", comment)
k({ "n" }, "<C-/>", comment_line)
-- legacy {{{
k({ "n", "x" }, "<Plug>VSCodeCommentary", comment)
k({ "n" }, "<Plug>VSCodeCommentaryLine", comment_line)
vim.api.nvim_create_user_command("VSCodeCommentary", function(arg)
  vscode.action("editor.action.commentLine", { range = { arg.line1 - 1, arg.line2 - 1 } })
end, { bang = true, range = true })
-- }}}
