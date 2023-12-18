-- TODO: Figure out why Treesitter doesn't parse.
vim.api.nvim_create_autocmd({ "TextChanged", "InsertLeave" }, {
  group = vim.api.nvim_create_augroup("VSCodeAutoTresitterParse", {}),
  callback = (function()
    local timer
    return function()
      if timer and timer:is_active() then
        timer:close()
      end
      timer = vim.defer_fn(function()
        if vim.b._vscode_last_parse_changedtick ~= vim.b.changedtick then
          vim.b._vscode_last_parse_changedtick = vim.b.changedtick
          pcall(function()
            vim.treesitter.get_parser():parse()
          end)
        end
      end, 300)
    end
  end)(),
})
