local M = {}

-- remove highlight groups that should never be shown
vim.api.nvim_create_autocmd({ "BufEnter", "FileType", "ColorScheme" }, {
    callback = function()
        vim.api.nvim_set_hl(0, "Normal", {})
        vim.api.nvim_set_hl(0, "NormalNC", {})
        vim.api.nvim_set_hl(0, "NormalFloat", {})
        vim.api.nvim_set_hl(0, "NonText", {})
        vim.api.nvim_set_hl(0, "SpecialKey", {})
        vim.api.nvim_set_hl(0, "TermCursor", {})
        vim.api.nvim_set_hl(0, "TermCursorNC", {})
        vim.api.nvim_set_hl(0, "Visual", {})
        vim.api.nvim_set_hl(0, "VisualNOS", {})
        vim.api.nvim_set_hl(0, "Conceal", {})
        vim.api.nvim_set_hl(0, "CursorLine", {})
        vim.api.nvim_set_hl(0, "CursorLineNr", {})
        vim.api.nvim_set_hl(0, "ColorColumn", {})
        vim.api.nvim_set_hl(0, "LineNr", {})
        vim.api.nvim_set_hl(0, "StatusLine", {})
        vim.api.nvim_set_hl(0, "StatusLineNC", {})
        vim.api.nvim_set_hl(0, "VertSplit", {})
        vim.api.nvim_set_hl(0, "Title", {})
        vim.api.nvim_set_hl(0, "WildMenu", {})
        vim.api.nvim_set_hl(0, "Whitespace", {})
    end
})

-- hide highlight groups when vscode owns the buffer
-- todo: these seem arbitrary
local ns = vim.api.nvim_create_namespace("vscode-owned-highlights")
vim.api.nvim_set_hl(ns, "EndOfBuffer", {})
vim.api.nvim_set_hl(ns, "ErrorMsg", {})
vim.api.nvim_set_hl(ns, "MoreMsg", {})
vim.api.nvim_set_hl(ns, "ModeMsg", {})
vim.api.nvim_set_hl(ns, "Question", {})
vim.api.nvim_set_hl(ns, "VisualNC", {})
vim.api.nvim_set_hl(ns, "WarningMsg", {})
vim.api.nvim_set_hl(ns, "Sign", {})
vim.api.nvim_set_hl(ns, "SignColumn", {})
vim.api.nvim_set_hl(ns, "ColorColumn", {})
vim.api.nvim_set_hl(ns, "QuickFixLine", {})
vim.api.nvim_set_hl(ns, "MsgSeparator", {})
vim.api.nvim_set_hl(ns, "MsgArea", {})
vim.api.nvim_set_hl(ns, "MatchParen", {})
vim.api.nvim_set_hl(ns, "MatchIt", {})
vim.api.nvim_set_hl(ns, "Operator", {})
vim.api.nvim_set_hl(ns, "Delimiter", {})
vim.api.nvim_set_hl(ns, "Identifier", {})
vim.api.nvim_set_hl(ns, "SpecialChar", {})
vim.api.nvim_set_hl(ns, "Number", {})
vim.api.nvim_set_hl(ns, "Type", {})
vim.api.nvim_set_hl(ns, "String", {})
vim.api.nvim_set_hl(ns, "Error", {})
vim.api.nvim_set_hl(ns, "Comment", {})
vim.api.nvim_set_hl(ns, "Constant", {})
vim.api.nvim_set_hl(ns, "Special", {})
vim.api.nvim_set_hl(ns, "Statement", {})
vim.api.nvim_set_hl(ns, "PreProc", {})
vim.api.nvim_set_hl(ns, "Underlined", {})
vim.api.nvim_set_hl(ns, "Ignore", {})
vim.api.nvim_set_hl(ns, "Todo", {})
vim.api.nvim_set_hl(ns, "Character", {})
vim.api.nvim_set_hl(ns, "Boolean", {})
vim.api.nvim_set_hl(ns, "Float", {})
vim.api.nvim_set_hl(ns, "Function", {})
vim.api.nvim_set_hl(ns, "Conditional", {})
vim.api.nvim_set_hl(ns, "Repeat", {})
vim.api.nvim_set_hl(ns, "Label", {})
vim.api.nvim_set_hl(ns, "Keyword", {})
vim.api.nvim_set_hl(ns, "Exception", {})
vim.api.nvim_set_hl(ns, "Include", {})
vim.api.nvim_set_hl(ns, "Define", {})
vim.api.nvim_set_hl(ns, "Macro", {})
vim.api.nvim_set_hl(ns, "PreCondit", {})
vim.api.nvim_set_hl(ns, "StorageClass", {})
vim.api.nvim_set_hl(ns, "Structure", {})
vim.api.nvim_set_hl(ns, "Typedef", {})
vim.api.nvim_set_hl(ns, "Tag", {})
vim.api.nvim_set_hl(ns, "SpecialComment", {})
vim.api.nvim_set_hl(ns, "Debug", {})
vim.api.nvim_set_hl(ns, "Folded", {})
vim.api.nvim_set_hl(ns, "FoldColumn", {})

vim.api.nvim_create_autocmd({ "BufEnter", "FileType", "ColorScheme" }, {
    callback = function()
        if vim.b.vscode_controlled then
            vim.api.nvim_set_hl_ns(ns)
        else
            vim.api.nvim_set_hl_ns(0)
        end
    end
})

-- if users want to ignore their own highlights in vscode owned buffers, they can use this namespace
M.vscode_owned_ns = ns

return M
