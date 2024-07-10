local api = vim.api
local fn = vim.fn

local M = {}

------------------------
------- Requests -------
------------------------

local REQUEST_STATE = {
  id = 0,
  callbacks = {},
}

local function add_callback(callback)
  REQUEST_STATE.id = REQUEST_STATE.id + 1
  REQUEST_STATE.callbacks[REQUEST_STATE.id] = callback
  return REQUEST_STATE.id
end

---Invoke the callback, called by vscode
---@param id number callback id
---@param result any result
---@param is_error boolean is error
function M.invoke_callback(id, result, is_error)
  vim.schedule(function()
    local callback = REQUEST_STATE.callbacks[id]
    REQUEST_STATE.callbacks[id] = nil
    if callback then
      if is_error then
        callback(result, nil)
      else
        callback(nil, result)
      end
    end
  end)
end

---- Run an action asynchronously
---@param name string The action name, generally a vscode command
---@param opts? table Optional options table, all fields are optional
---            - args: (table) Optional arguments for the action
---            - range: (table) Specific range for the action. In visual mode, this parameter is generally not needed.
---                     Three formats supported (All values are 0-indexed):
---                        - [start_line, end_line]
---                        - [start_line, start_character, end_line, end_character]
---                        - {start = { line = start_line , character = start_character}, end = { line = end_line , character = end_character}}
---            - restore_selection: (boolean) Whether to preserve the current selection, only valid when `range` is specified. Defaults to `true`
---            - callback: (function(err: string|nil, ret: any))
---                        Optional callback function to handle the action result.
---                        The first argument is the error message, and the second is the result.
---                        If no callback is provided, any error message will be shown as a notification in VSCode.
function M.action(name, opts)
  opts = opts or {}
  opts.restore_selection = opts.restore_selection ~= false
  vim.validate({
    name = { name, "string" },
    opts = { opts, "table", true },
  })
  vim.validate({
    ["opts.callback"] = { opts.callback, "f", true },
    ["opts.args"] = { opts.args, "t", true },
    ["opts.range"] = {
      opts.range,
      function(range)
        if range == nil then
          return true
        end
        if type(range) ~= "table" then
          return false
        end
        if vim.islist(opts.range) then
          return #opts.range == 2 or #opts.range == 4
        end
        return range.start
          and range.start.line
          and range.start.character
          and range["end"]
          and range["end"].line
          and range["end"].character
      end,
    },
    ["opts.restore_selection"] = { opts.restore_selection, "b", true },
  })
  if opts.args and not vim.islist(opts.args) then
    opts.args = { opts.args }
  end
  if opts.callback then
    opts.callback = add_callback(opts.callback)
  end
  vim.schedule(function()
    vim.rpcnotify(vim.g.vscode_channel, "vscode-action", name, opts)
  end)
end

--- Run an action synchronously
---@param name string The action name, generally a vscode command
---@param opts? table Optional options table, all fields are optional
---            - args: (table) Optional arguments for the action
---            - range: (table) Specific range for the action. In visual mode, this parameter is generally not needed.
---                     Three formats supported (All values are 0-indexed):
---                        - [start_line, end_line]
---                        - [start_line, start_character, end_line, end_character]
---                        - {start = { line = start_line , character = start_character}, end = { line = end_line , character = end_character}}
---            - restore_selection: (boolean) Whether to preserve the current selection, only valid when `range` is specified. Defaults to `true`
---@param timeout? number Timeout in milliseconds. The default value is -1, which means no timeout.
---
---@return any: result
function M.call(name, opts, timeout)
  opts = opts or {}
  opts.restore_selection = opts.restore_selection ~= false
  timeout = timeout or -1
  vim.validate({
    name = { name, "string" },
    opts = { opts, "table", true },
    timeout = { timeout, "number", true },
  })
  vim.validate({
    ["opts.callback"] = { opts.callback, "nil" },
    ["opts.args"] = { opts.args, "t", true },
    ["opts.range"] = {
      opts.range,
      function(range)
        if range == nil then
          return true
        end
        if type(range) ~= "table" then
          return false
        end
        if vim.islist(opts.range) then
          return #opts.range == 2 or #opts.range == 4
        end
        return range.start
          and range.start.line
          and range.start.character
          and range["end"]
          and range["end"].line
          and range["end"].character
      end,
    },
    ["opts.restore_selection"] = { opts.restore_selection, "b", true },
  })

  if opts.args and not vim.islist(opts.args) then
    opts.args = { opts.args }
  end

  if timeout <= 0 then
    return vim.rpcrequest(vim.g.vscode_channel, "vscode-action", name, opts)
  end

  local done = false
  local err, res
  opts.callback = function(_err, _res)
    err = _err
    res = _res
    done = true
  end
  M.action(name, opts)
  vim.wait(timeout, function()
    return done
  end)
  if done then
    if err == nil then
      return res
    else
      error(err)
    end
  else
    error(string.format("Call '%s' timed out.", name))
  end
end

--- Evaluate javascript synchronously inside vscode with access to the
--- [VSCode API](https://code.visualstudio.com/api/references/vscode-api) and return the result.
---
---@param code string the javascript code to run
---           - the code runs in an async function context
---             (so `await` can be used. Make sure to `await` if calling an async function from the VSCode API)
---           - use `return` to return a value to lua
---           - use the `vscode` variable to access the VSCode API
---           - use the `args` variable to access any arguments passed from lua
---@param opts? table Optional options table, all fields are optional
---            - args: (any) Optional arguments to serialize and make available to the code being run (as the `args` variable)
---@param timeout? number Timeout in milliseconds. The default value is -1, which means no timeout.
---
---@return any: the result of evaluating the given code in VSCode
function M.eval(code, opts, timeout)
  vim.validate({
    code = { code, "string" },
    opts = { opts, "table", true },
    timeout = { timeout, "number", true },
  })
  opts = opts or {}
  opts.args = { code, opts.args }
  return M.call("eval", opts, timeout)
end

--- Evaluate javascript asynchronously inside vscode with access to the
--- [VSCode API](https://code.visualstudio.com/api/references/vscode-api).
---
---@param code string the javascript code to run
---@param opts? table Optional options table, all fields are optional
---            - args: (any) Optional arguments to serialize and make available to the code being run (as the `args` variable)
---            - callback: (function(err: string|nil, ret: any))
---                        Optional callback function to handle the evaluated result.
---                        The first argument is the error message, and the second is the result.
---                        If no callback is provided, any error message will be shown as a notification in VSCode.
function M.eval_async(code, opts)
  vim.validate({
    code = { code, "string" },
    opts = { opts, "table", true },
  })
  opts = opts or {}
  opts.args = { code, opts.args }
  M.action("eval", opts)
end

---------------------------
------- Event Hooks -------
---------------------------

local EVENT_STATE = {}

--[[
List of events:

event -> args
-------------
]]

---@param event string
---@param callback function
function M.on(event, callback)
  vim.validate({
    event = { event, "string" },
    callback = { callback, "function" },
  })
  local cbs = EVENT_STATE[event] or {}
  if not vim.tbl_contains(cbs, callback) then
    table.insert(cbs, callback)
    EVENT_STATE[event] = cbs
  end
end

---@param event string
---@vararg any
function M.fire_event(event, ...)
  local args = { ... }
  vim.schedule(function()
    vim.tbl_map(function(cb)
      cb(unpack(args))
    end, EVENT_STATE[event] or {})
  end)
end

-------------------------------------------
------- VSCode settings integration -------
-------------------------------------------

---Check if configuration has a certain value.
---@param name string|string[] The configuration name or an array of configuration names.
---@return boolean|boolean[] Returns true if the configuration has a certain value, false otherwise.
---                          If name is an array, returns an array of booleans indicating whether each configuration
---                          has a certain value or not.
function M.has_config(name)
  vim.validate({ name = { name, { "s", "t" } } })
  return M.call("has_config", { args = { name } })
end

---Get configuration value
---@param name string|string[] The configuration name or an array of configuration names.
---@return unknown|unknown[] The value of the configuration. If name is an array,
---                          returns an array of values corresponding to each configuration.
function M.get_config(name)
  vim.validate({ name = { name, { "s", "t" } } })
  return M.call("get_config", { args = { name } })
end

---Update configuration value
---@param name string|string[] The configuration name or an array of configuration names.
---@param value unknown|unknown[]  The new value for the configuration.
---@param target "global"|"workspace" The configuration target
function M.update_config(name, value, target)
  vim.validate({ name = { name, { "s", "t" } } })
  local name_is_table = type(name) == "table"
  local value_is_table = type(value) == "table"
  if name_is_table and not value_is_table then
    error([[The "name" is a table, but the "value" is not]])
  elseif value_is_table and not name_is_table then
    error([[The "value" is a table, but the "name" is not]])
  end
  assert(
    target == nil or target == "global" or target == "workspace",
    [["target" can only be nil or one from "global" and "workspace"]]
  )
  return M.call("update_config", { args = { name, value, target } })
end

---------------------------
------ Notifications ------
---------------------------

--- Display a notification to the user.
---
---@param msg string Content of the notification to show to the user.
---@param level integer|nil One of the values from |vim.log.levels|.
---@param opts table|nil Optional parameters. Unused by default.
---@diagnostic disable-next-line: unused-local
function M.notify(msg, level, opts)
  local levels = vim.log.levels
  level = level or levels.INFO

  -- legacy
  if type(level) == "string" then
    if level == "error" then
      level = levels.ERROR
    elseif level == "warn" then
      level = levels.WARN
    else
      level = levels.INFO
    end
  end

  local cmd
  if level >= levels.ERROR then
    cmd = "await vscode.window.showErrorMessage(args)"
  elseif level >= levels.WARN then
    cmd = "await vscode.window.showWarningMessage(args)"
  else
    cmd = "await vscode.window.showInformationMessage(args)"
  end

  M.eval_async(cmd, { args = msg })
end

---------------------------------
------ map-operator helper ------
---------------------------------

do
  ---@class Context
  ---@field range lsp.Range
  ---@field is_linewise boolean true indicates linewise, otherwise it is charwise.
  ---@field is_single_line boolean  true if start.line and end.line are equal.
  ---@field is_current_line boolean is single line, and is current line

  local op_func_id = 0

  ---@see map-operator
  ---
  ---Example: Remap 'gq' to use 'editor.action.formatSelection'
  ---
  ---```lua
  --- local format = vscode.to_op(function(ctx)
  ---   vscode.action("editor.action.formatSelection", { range = ctx.range })
  --- end)
  ---
  --- vim.keymap.set({ "n", "x" }, "gq", format, { expr = true })
  --- vim.keymap.set({ "n" }, "gqq", function()
  ---   return format() .. "_"
  --- end, { expr = true })
  ---````
  function M.to_op(func)
    op_func_id = op_func_id + 1
    local op_func_name = "__vscode_op_func_" .. tostring(op_func_id)
    local operatorfunc = "v:lua." .. op_func_name

    local op_func = function(motion)
      local mode = api.nvim_get_mode().mode
      if not motion then
        if mode == "n" then
          vim.go.operatorfunc = operatorfunc
          return "g@"
        elseif mode ~= "\x16" and mode:lower() ~= "v" then
          return "<Ignore>"
        end
      end

      local start_pos
      local end_pos
      if motion then
        start_pos = api.nvim_buf_get_mark(0, "[")
        end_pos = api.nvim_buf_get_mark(0, "]")
      else
        local a = fn.getpos("v")
        local b = fn.getpos(".")
        start_pos = { a[2], a[3] - 1 }
        end_pos = { b[2], b[3] - 1 }
      end

      if start_pos[1] > end_pos[1] or (start_pos[1] == end_pos[1] and start_pos[2] > end_pos[2]) then
        start_pos, end_pos = end_pos, start_pos
      end

      local is_linewise = motion == "line" or mode == "V"
      if is_linewise then
        start_pos = { start_pos[1], 0 }
        end_pos = { end_pos[1], #fn.getline(end_pos[1]) }
      end

      local range = vim.lsp.util.make_given_range_params(start_pos, end_pos, 0, "utf-16").range
      local is_single_line = range.start.line == range["end"].line
      local is_current_line = is_single_line and range.start.line == fn.line(".") - 1
      ---@type Context
      local ctx = {
        range = range,
        is_linewise = is_linewise,
        is_single_line = is_single_line,
        is_current_line = is_current_line,
      }
      func(ctx)
      return "<Ignore>"
    end

    _G[op_func_name] = op_func
    return _G[op_func_name]
  end
end

-----------------------
------ utilities ------
-----------------------

---Perform operations in insert mode
---If in visual mode, this function will preserve the selection after
---switching to insert mode.
---
---Example:
---Make `editor.action.addSelectionToNextFindMatch` work correctly in any mode.
---This is the behavior of the default VSCode shortcut Ctrl+d: Add Selection To Next Find Match.
---
---```lua
---vim.keymap.set({ "n", "x", "i" }, "<C-d>", function()
---  vscode.with_insert(function()
---    vscode.action("editor.action.addSelectionToNextFindMatch")
---  end)
---end)
---````
---
---@param callback function Callback function to run after switching to insert mode.
function M.with_insert(callback)
  vim.validate({ callback = { callback, "f" } })

  local mode = api.nvim_get_mode().mode

  local startinsert = function(keys)
    keys = api.nvim_replace_termcodes(keys, true, true, true)
    api.nvim_feedkeys(keys, "n", false)
  end

  ---@param ranges lsp.Range[]|nil`
  local run_callback = function(ranges)
    if ranges then
      M.action("start-multiple-cursors", { args = { ranges }, callback = callback })
    else
      M.action("noop", { callback = callback })
    end
  end

  --- Insert ---
  if mode == "i" then
    run_callback()
    return
  end

  --- Normal ---
  if mode == "n" then
    startinsert("i")
    run_callback()
    return
  end

  --- Visual ---
  if mode:match("[vV\x16]") then
    local A = fn.getpos("v")
    local B = fn.getpos(".")
    local start_pos = { A[2], A[3] - 1 }
    local end_pos = { B[2], B[3] - 1 }

    if start_pos[1] > end_pos[1] or (start_pos[1] == end_pos[1] and start_pos[2] > end_pos[2]) then
      start_pos, end_pos = end_pos, start_pos
    end

    if mode == "V" then
      start_pos = { start_pos[1], 0 }
      end_pos = { end_pos[1], #fn.getline(end_pos[1]) }
    end

    local range = vim.lsp.util.make_given_range_params(start_pos, end_pos, 0, "utf-16").range
    local ranges = { range }

    api.nvim_win_set_cursor(0, end_pos)
    startinsert("<Esc>" .. (vim.o.selection ~= "exclusive" and "a" or "i"))

    run_callback(ranges)
    return
  end

  --- Other ---
  startinsert("<Esc><Esc>i")
  run_callback()
end

return M
