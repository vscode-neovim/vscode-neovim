local vscode = require("vscode")

--- Prompts the user to pick from a list of items, allowing arbitrary (potentially asynchronous)
--- work until `on_choice`.
---
--- Example:
---
--- ```lua
--- vim.ui.select({ 'tabs', 'spaces' }, {
---     prompt = 'Select tabs or spaces:',
---     format_item = function(item)
---         return "I'd like to choose " .. item
---     end,
--- }, function(choice)
---     if choice == 'spaces' then
---         vim.o.expandtab = true
---     else
---         vim.o.expandtab = false
---     end
--- end)
--- ```
---
---@param items table Arbitrary items
---@param opts table Additional options
---     - prompt (string|nil)
---               Text of the prompt. Defaults to `Select one of:`
---     - format_item (function item -> text)
---               Function to format an
---               individual item from `items`. Defaults to `tostring`.
---     - kind (string|nil)
---               Arbitrary hint string indicating the item shape.
---               Plugins reimplementing `vim.ui.select` may wish to
---               use this to infer the structure or semantics of
---               `items`, or the context in which select() was called.
---@param on_choice function ((item|nil, idx|nil) -> ())
---               Called once the user made a choice.
---               `idx` is the 1-based index of `item` within `items`.
---               `nil` if the user aborted the dialog.
local function vscode_ui_select(items, opts, on_choice)
  -- validate parameters
  vim.validate({
    items = { items, "table", false },
    on_choice = { on_choice, "function", false },
  })
  opts = opts or {}

  -- set sane defaults
  opts.prompt = opts.prompt or "Select one of"
  opts.format_item = opts.format_item or tostring
  opts.kind = opts.prompt or "string"

  -- fill the vscode datastructures
  local vscode_items = {}
  for idx, item in ipairs(items) do
    table.insert(vscode_items, {
      idx = idx,
      label = opts.format_item(item),
      detail = item.detail or nil,
    })
  end
  local vscode_opts = {
    title = opts.prompt,
    placeHolder = opts.prompt,
    matchOnDetail = true,
  }

  -- open the select dialog
  vscode.eval_async("return await vscode.window.showQuickPick(args.items, args.opts)", {
    args = {
      items = vscode_items,
      opts = vscode_opts,
    },
    callback = function(err, res)
      if err or res == vim.NIL then -- vim.NIL if cancelled
        on_choice(nil, nil)
      else
        on_choice(items[res.idx], res.idx)
      end
    end,
  })
end

--- Prompts the user for input, allowing arbitrary (potentially asynchronous) work until
--- `on_confirm`.
---
--- Example:
---
--- ```lua
--- vim.ui.input({ prompt = 'Enter value for shiftwidth: ' }, function(input)
---     vim.o.shiftwidth = tonumber(input)
--- end)
--- ```
---
---@param opts table Additional options. See |input()|
---     - prompt (string|nil)
---               Text of the prompt
---     - default (string|nil)
---               Default reply to the input
---@param on_confirm function ((input|nil) -> ())
---               Called once the user confirms or abort the input.
---               `input` is what the user typed (it might be
---               an empty string if nothing was entered), or
---               `nil` if the user aborted the dialog.
local function vscode_ui_input(opts, on_confirm)
  -- validate parameters
  vim.validate({
    on_confirm = { on_confirm, "function", false },
  })
  opts = opts or {}

  -- set sane defaults
  opts.prompt = opts.prompt or "Enter a value"
  opts.default = opts.default or ""

  -- fill the vscode datastructures
  local vscode_opts = {
    title = opts.prompt,
    placeHolder = opts.prompt,
    value = opts.default,
  }

  -- open the input dialog
  vscode.eval_async("return await vscode.window.showInputBox(args.opts)", {
    args = {
      opts = vscode_opts,
    },
    callback = function(err, res)
      if err or res == vim.NIL then -- vim.NIL if cancelled
        on_confirm(nil)
      else
        on_confirm(res)
      end
    end,
  })
end

-- remap the neovim ui function to use the vscode equivalents
vim.ui.select = vscode_ui_select
vim.ui.input = vscode_ui_input
