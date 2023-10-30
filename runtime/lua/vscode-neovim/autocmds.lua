local function setup()
  local group = vim.api.nvim_create_augroup("VSCodeCloseCompletionWidgets", { clear = true })
  vim.api.nvim_create_autocmd("InsertLeave", {
    group = group,
    callback = function()
      vim.fn.VSCodeNotify("hideSuggestWidget")
      vim.fn.VSCodeNotify("closeParameterHints")
      vim.fn.VSCodeNotify("editor.action.inlineSuggest.hide")
    end,
  })
end

return { setup = setup }
