vim.filetype.add({
  pattern = {
    -- To ensure that the user's fallback pattern is not overridden.
    [".*.*.*"] = {
      priority = -math.huge,
      function(_, bufnr)
        local ok, filetype = pcall(vim.api.nvim_buf_get_var, bufnr, "vscode_filetype")
        if ok and filetype then
          return filetype
        end
      end,
    },
  },
})
