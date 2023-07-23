-- disable matchparen because we don't need it
vim.g.loaded_matchparen = 1

-- syntax groups that are hidden by default but can be overridden by `vscode-neovim.highlightGroups.highlights` or init.vim config (inside ColorScheme au)
local function ignore_highlights()
    vim.api.nvim_set_hl(0, "Normal", {})
    vim.api.nvim_set_hl(0, "NormalNC", {})
    vim.api.nvim_set_hl(0, "NormalFloat", {})
    vim.api.nvim_set_hl(0, "NonText", {})
    vim.api.nvim_set_hl(0, "Visual", {})
    vim.api.nvim_set_hl(0, "VisualNOS", {})
    vim.api.nvim_set_hl(0, "Substitute", {})
    vim.api.nvim_set_hl(0, "Whitespace", {})
end

ignore_highlights()
vim.api.nvim_create_autocmd({ "FileType", "ColorScheme" }, { callback = ignore_highlights })
