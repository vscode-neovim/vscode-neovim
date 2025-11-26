--[[
NOTES ABOUT KEYMAPS... it gets confusing
  -- ignore "o" in j/k that gets complex usually u want to 3yj according to relative lines not screen lines
  -- check vim.fn.mode() to avoid issues with visual block mode
  -- we can add v:count == 0 ? check to keep 3j function the same as without wrap? need to ask manintainer about this. for now i just include it in my personal remapping of j.
  -- is_macro_executing to fix keymap issues when executing macros. plays back keys as if theres no word wrap.
  -- i learned after re-writing these keymaps 20 times that for proper functionality in macros we need to use expr in mappings
  -- i prefer to remap I/A to be wrap aware. but these could be changed to something else to prevent user confusion.
  -- same with D/C/Y

  KNOWN ISSUES:
  -- currently using these keymaps in a ":norm" without bang will cause issues. recommend toggleing off wrap before using command.

--]]

local utils = require("vscode.word_wrap.utils")
local vscode = require("vscode")

M = {
  {
    "n",
    "gj",
    function()
      if utils.is_macro_executing() then
        return "j"
      end
      vscode.call("cursorMove", {
        args = { to = "down", by = "wrappedLine", value = vim.v.count },
      })
      return ""
    end,
    { expr = true, silent = true, desc = "cursor N lines downward (include 'wrap')" },
  },

  {
    "v",
    "gj",
    function()
      if utils.is_macro_executing() or vim.fn.mode() ~= "v" then
        return "j"
      end
      vscode.call("cursorMove", {
        args = { to = "down", by = "wrappedLine", select = true, value = vim.v.count },
      })
      return ""
    end,
    { expr = true, silent = true, desc = "cursor N lines downward (include 'wrap')" },
  },

  {
    "n",
    "gk",
    function()
      if utils.is_macro_executing() then
        return "k"
      end
      vscode.call("cursorMove", {
        args = { to = "up", by = "wrappedLine", value = vim.v.count },
      })
      return ""
    end,
    { expr = true, silent = true, desc = "cursor N lines up (include 'wrap')" },
  },

  {
    "v",
    "gk",
    function()
      if utils.is_macro_executing() or vim.fn.mode() ~= "v" then
        return "k"
      end
      vscode.call("cursorMove", {
        args = { to = "up", by = "wrappedLine", select = true, value = vim.v.count },
      })
      return ""
    end,
    { expr = true, silent = true, desc = "cursor N lines up (include 'wrap')" },
  },
  {
    "n",
    "g0",
    function()
      if utils.is_macro_executing() then
        return "0"
      end
      vscode.call("cursorMove", {
        args = { to = "wrappedLineStart" },
      })
      return ""
    end,
    { expr = true, silent = true, desc = "first char of wrapped line (wrap-aware)" },
  },
  {
    "v",
    "g0",
    function()
      if utils.is_macro_executing() or vim.fn.mode() ~= "v" then
        return "0"
      end
      vscode.call("cursorRight") -- vscode doesnt include char under cursor in visual selection, neovim does. Move right to compensate. neither includes char under crsor in operator pending mode, so undo in "o" mapping below
      vscode.call("cursorMove", { args = { to = "wrappedLineStart", select = true } })
      vscode.call("cursorRight", { args = { select = true } }) -- HACK: ya idk without this operator pending doesnt work. spent days figuring this out. fml.
      return ""
    end,
    { expr = true, silent = true, desc = "first non-blank character of the line (include 'wrap')" },
  },

  {
    { "o" },
    "g0",
    function()
      if utils.is_macro_executing() then
        return "0"
      end
      vscode.call("cursorLeft") -- undoing the conpensating right from visual mode
      return ":<C-U>normal hvg0<CR>"
    end,
    { expr = true, silent = true, desc = "first non-blank character of the line (include 'wrap')" },
  },
  {
    "n",
    "g^",
    function()
      if utils.is_macro_executing() then
        return "^"
      end
      vscode.call("cursorMove", {
        args = { to = "wrappedLineFirstNonWhitespaceCharacter" },
      })
      return ""
    end,
    { expr = true, silent = true, desc = "first non-blank character of the line (include 'wrap')" },
  },
  {
    "v",
    "g^",
    function()
      if utils.is_macro_executing() or vim.fn.mode() ~= "v" then
        return "^"
      end
      vscode.call("cursorMove", {
        args = { to = "wrappedLineFirstNonWhitespaceCharacter", select = true },
      })
      -- VSCode selections don’t include char under cursor, Neovim does
      vscode.call("cursorRight", { args = { select = true } })
      return ""
    end,
    { expr = true, silent = true, desc = "first non-blank character of the line (include 'wrap')" },
  },
  {
    { "o" },
    "g^",
    function()
      if utils.is_macro_executing() then
        return "^"
      end
      return ":<C-U>normal vg^<CR>"
    end,
    { expr = true, silent = true, desc = "first non-blank character of the line (include 'wrap')" },
  },
  {
    "n",
    "g$",
    function()
      if utils.is_macro_executing() then
        return "$"
      end
      vscode.call("cursorMove", {
        args = { to = "wrappedLineLastNonWhitespaceCharacter" },
      })
      if not (vim.o.virtualedit:find("all") or vim.o.virtualedit:find("onemore")) then
        vscode.call("cursorLeft")
      end
      return vim.api.nvim_replace_termcodes("<Ignore>", true, true, true) -- without this cursor is desynced after motion,
    end,
    { expr = true, silent = true, desc = "end of the line (include 'wrap')" },
  },
  {
    "v",
    "g$",
    function()
      if utils.is_macro_executing() or vim.fn.mode() ~= "v" then
        return "$"
      end
      vscode.call("cursorMove", {
        args = { to = "wrappedLineEnd", select = true },
      })
      vscode.call("cursorLeft") -- adjust like Neovim’s visual mode
      return ""
    end,
    { expr = true, silent = true, desc = "end of the line (include 'wrap')" },
  },
  {
    { "o" },
    "g$",
    function()
      if utils.is_macro_executing() then
        return "$"
      end
      return ":<C-U>normal vg$<CR>"
    end,
    { expr = true, silent = true, desc = "end of the line (include 'wrap')" },
  },
  {
    "n",
    "I",
    function()
      if utils.is_macro_executing() then
        return "I"
      end
      vscode.call("cursorMove", {
        args = { to = "wrappedLineFirstNonWhitespaceCharacter" },
      })
      return "i"
    end,
    { expr = true, silent = true, desc = "I (include 'wrap')" },
  },
  {
    "n",
    "A",
    function()
      if utils.is_macro_executing() then
        return "A"
      end
      vscode.call("cursorMove", {
        args = { to = "wrappedLineLastNonWhitespaceCharacter" },
      })
      return "i" -- 'i' because cursor is already past the end (virtualedit)
    end,
    { expr = true, silent = true, desc = "A (include 'wrap')" },
  },
  -- NOTE: below changes behavior of Y,D,C to respect line wrap. see note at top of file.
  {
    "n",
    "D",
    function()
      if utils.is_macro_executing() then
        return "D"
      else
        return "dg$"
      end
    end,
    { expr = true, remap = true, desc = "[D]elete to end of line (include 'wrap')" },
  },
  {
    "n",
    "C",
    function()
      if utils.is_macro_executing() then
        return "C"
      else
        return "cg$"
      end
    end,
    { expr = true, remap = true, desc = "[C]hange to end of line (include 'wrap')" },
  },
  {
    "n",
    "Y",
    function()
      if utils.is_macro_executing() then
        return "Y"
      else
        return "yg$"
      end
    end,
    { expr = true, remap = true, desc = "[Y]ank to end of line (include 'wrap')" },
  },
  -- all keymaps user would put in their config for proper word wrap behavior
  {
    { "n", "v" },
    "j",
    "v:count == 0 ? 'gj' : 'j'",
    { expr = true, remap = true, desc = "cursor N lines downward (include 'wrap')" },
  },
  {
    { "n", "v" },
    "k",
    "v:count == 0 ? 'gk' : 'k'",
    { expr = true, remap = true, desc = "cursor N lines up (include 'wrap')" },
  },
  {
    { "n", "v", "o" },
    "0",
    "g0",
    { remap = true, desc = "first char of the line (include 'wrap')" },
  },
  {
    { "n", "v", "o" },
    "^",
    "g^",
    { remap = true, desc = "first non-blank character of the line (include 'wrap')" },
  },
  {
    { "n", "v", "o" },
    "$",
    "g$",
    { remap = true, desc = "end of the line (include 'wrap')" },
  },
}

return M
