local vscode = require("vscode")

local function esc()
  local key = vim.api.nvim_replace_termcodes("<esc>", true, true, true)
  vim.api.nvim_feedkeys(key, "n", false)
end

local k = function(mode, lhs, rhs)
  vim.keymap.set(mode, lhs, rhs, { expr = true }) -- expr is required
end

------------
-- Format --
------------
local format = vscode.to_op(function(ctx)
  vscode.action("editor.action.formatSelection", { range = ctx.range, callback = esc })
end)
local format_line = function()
  return format() .. "_"
end

k({ "n", "x" }, "gq", format)
k({ "n" }, "gqq", format_line)
k({ "n", "x" }, "=", format)
k({ "n" }, "==", format_line)

-------------
-- Comment --
-------------
local comment = vscode.to_op(function(ctx)
  local cmd = ctx.is_linewise and "editor.action.commentLine" or "editor.action.blockComment"
  local opts = { range = ctx.range, callback = esc }
  if ctx.is_linewise and ctx.is_current_line then
    opts.range = nil
  end
  vscode.action(cmd, opts)
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
