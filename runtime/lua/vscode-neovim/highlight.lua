---@diagnostic disable: inject-field

-- Copy global highlights and overrides highlights to the custom namespace, only external buffers use global namespace

local api = vim.api
local vscode = require("vscode-neovim.api")

local NS = api.nvim_create_namespace("vscode-neovim-highlight")

vim.opt.conceallevel = 0
vim.g.html_ignore_conceal = 1
vim.g.vim_json_conceal = 0
vim.g.markdown_recommended_style = 0
vim.g.markdown_folding = 0

---Link highlights with same values to the same highlight, to avoid performance
---and rendering issues with vscode decorations caused by a large number of
---highlight IDs due to highlight merging.
---Currently, only handle highlights that need to be cleared
api.nvim_set_hl(0, "VSCodeNone", {})

---@param id number
---@param name string
---@param value table
local function set_hl(id, name, value)
  if vim.tbl_isempty(value) then
    return api.nvim_set_hl(id, name, { link = "VSCodeNone" })
  end
  return api.nvim_set_hl(id, name, value)
end

local function setup_globals()
  local custom_hls = vscode.get_config("vscode-neovim.highlightGroups.highlights")
  if type(custom_hls) ~= "table" then
    custom_hls = {}
  end
  for hl in pairs(custom_hls) do
    -- If we directly clear the highlighting, it may cause the highlighting to
    -- become "unavailable". For example, nvim_buf_set_extmark will ignore the
    -- highlighting that has no visual effect on the screen.
    -- So we use this special and useless attribute to allow highlighting to
    -- trigger rendering normally.
    -- In vscode, we will remove this attribute so that we can use the empty
    -- attribute to determine whether to use custom highlighting. This allows
    -- other highlights to be rendered correctly when mixed with custom
    -- highlighting.
    set_hl(0, hl, { altfont = true })
  end

  -- stylua: ignore start
  local hls = {
    Normal       = {},
    NormalNC     = {},
    NormalFloat  = {},
    Visual       = {},
    VisualNC     = {},
    VisualNOS    = {},
    Substitute   = {},
    Whitespace   = {},
    LineNr       = {},
    LineNrAbove  = {},
    LineNrBelow  = {},
    CursorLine   = {},
    CursorLineNr = {},
    ColorColumn  = {},
    FoldColumn   = {},
    Folded       = {},
    Sign         = {},
    SignColumn   = {},
    MsgSeparator = {},
    MsgArea      = {},
    Question     = {},
    QuickFixLine = {},
    EndOfBuffer  = {},
    Debug        = {},
    MatchParen   = {},
    CursorColumn = {},
    NonText      = {},
    -- make cursor visible for plugins that use fake cursor
    Cursor       = { reverse = true },
  }
  -- stylua: ignore end
  for name, attrs in pairs(hls) do
    if not custom_hls[name] then
      set_hl(0, name, attrs)
    end
  end
end

-- stylua: ignore start
local overrides = {
  Delimiter   = {}, Identifier   = {}, SpecialChar    = {}, Number       = {}, Type        = {},
  String      = {}, Error        = {}, Comment        = {}, Constant     = {}, Special     = {},
  Statement   = {}, PreProc      = {}, Underlined     = {}, Ignore       = {}, Todo        = {},
  Character   = {}, Boolean      = {}, Float          = {}, Function     = {}, Conditional = {},
  Repeat      = {}, Label        = {}, Keyword        = {}, Exception    = {}, Include     = {},
  Define      = {}, Macro        = {}, PreCondit      = {}, StorageClass = {}, Structure   = {},
  Typedef     = {}, Tag          = {}, SpecialComment = {}, Operator     = {}, Debug       = {},
}
-- stylua: ignore end
local overridden = {}
local function setup_syntax_overrides()
  for name, attrs in pairs(overrides) do
    if not overridden[name] then
      overridden[name] = true
      set_hl(NS, name, attrs)
    end
  end
end

local cleared_syntax_groups = {}
local function setup_syntax_groups()
  local output = api.nvim_exec2("syntax", { output = true })
  local items = vim.split(output.output, "\n")
  for _, item in ipairs(items) do
    local group = item:match([[([%w@%.]+)%s+xxx]])
    if group and not cleared_syntax_groups[group] then
      cleared_syntax_groups[group] = true
      set_hl(NS, group, {})
    end
  end
end

local function set_win_hl_ns()
  local ok, curr_ns, target_ns, vscode_controlled
  for _, win in ipairs(api.nvim_list_wins()) do
    local buf = api.nvim_win_get_buf(win)

    ok, curr_ns = pcall(api.nvim_win_get_var, win, "_vscode_hl_ns")
    curr_ns = ok and curr_ns or 0

    ok, vscode_controlled = pcall(api.nvim_buf_get_var, buf, "vscode_controlled")
    target_ns = (ok and vscode_controlled) and NS or 0

    if curr_ns ~= target_ns then
      api.nvim_win_set_var(win, "_vscode_hl_ns", target_ns)
      api.nvim_win_set_hl_ns(win, target_ns)
    end
  end
end

local function setup()
  local group = api.nvim_create_augroup("VSCodeNeovimHighlight", { clear = true })
  api.nvim_create_autocmd({ "BufWinEnter", "BufEnter", "WinEnter", "WinNew", "WinScrolled" }, {
    group = group,
    callback = set_win_hl_ns,
  })
  api.nvim_create_autocmd({ "VimEnter", "ColorScheme", "Syntax", "FileType" }, {
    group = group,
    callback = function(ev)
      api.nvim_set_hl(0, "VSCodeNone", {})
      if ev.event == "VimEnter" or ev.event == "ColorScheme" then
        setup_globals()
        -- highlights of custom namespace
        setup_syntax_overrides()
      end
      if ev.event == "Syntax" then
        -- wait syntax things done
        vim.defer_fn(setup_syntax_groups, 200)
      else
        setup_syntax_groups()
      end
    end,
  })
end

return { setup = setup }
