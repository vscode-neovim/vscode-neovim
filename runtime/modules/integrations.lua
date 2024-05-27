local code = require("vscode")

vim.api.nvim_create_autocmd("InsertLeave", {
  group = vim.api.nvim_create_augroup("vscode.integrations", { clear = true }),
  callback = function()
    code.action("hideSuggestWidget")
    code.action("closeParameterHints")
    code.action("editor.action.inlineSuggest.hide")
  end,
})
