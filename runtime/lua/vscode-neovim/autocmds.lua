local function setup()
  vim.api.nvim_create_autocmd("InsertLeave", {
    callback = function()
      vim.fn.VSCodeNotify("hideSuggestWidget")
      vim.fn.VSCodeNotify("closeParameterHints")
      vim.fn.VSCodeNotify("editor.action.inlineSuggest.hide")
    end,
  })
end

return { setup = setup }
