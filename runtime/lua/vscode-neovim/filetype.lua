local M = {}

function M.setup()
  vim.filetype.add({
    pattern = {
      -- To ensure that the user's fallback pattern is not overridden.
      [".*.*.*"] = {
        priority = -math.huge,
        function(_, bufnr)
          local name = vim.api.nvim_buf_get_name(bufnr)
          if name:match("vscode%-notebook%-cell") then
            return "python"
          end
        end,
      },
    },
  })
end

return M
