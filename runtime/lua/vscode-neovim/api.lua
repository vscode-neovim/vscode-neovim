local M = {}

------- Requests -------

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
---@param result any resutl
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

---Run action, this function is asynchronous
---@param name string The action name, generally a vscode command
---@param opts? table Optional options table, all fields are optional
---            - args: (table) Optional arguments for the action
---            - range: (table) Specific range for the action. In visual mode, this parameter is generally not required.
---                     The format is consistent with the LSP Protocol.
---            - line_range: (table) An array [start_line, end_line], which has the same effect as range. Lines are zero indexed
---            - leave_selection: (boolean) Whether to preserve the selected range, only valid when range or line_range is specified
---            - callback: (function(err: string|nil, ret: any))
---                        Optional callback function to handle the action result.
---                        The first argument is the error message, and the second is the result.
---                        If no callback is provided, any error message will be shown as a notification in VSCode.
function M.action(name, opts)
  vim.validate({
    name = { name, "string" },
    opts = { opts, "table", true },
  })
  opts = opts or {}
  vim.validate({
    ["opts.callback"] = { opts.callback, "f", true },
    ["opts.args"] = { opts.args, "t", true },
    ["opts.range"] = { opts.range, "t", true },
    ["opts.line_range"] = { opts.lien_range, "t", true },
    ["opts.leave_selection"] = { opts.leave_selection, "b", true },
  })
  if opts.range and opts.line_range then
    error([[Cannot specify both "range" and "line_range"]])
  end
  if opts.callback then
    opts.callback = add_callback(opts.callback)
  end
  vim.schedule(function()
    vim.rpcnotify(vim.g.vscode_channel, "vscode-action", name, opts)
  end)
end

--- Run action, this function is synchronous and blocking
---@param name string The action name, generally a vscode command
---@param opts? table Optional options table, all fields are optional
---            - args: (table) Optional arguments for the action
---            - range: (table) Specific range for the action. In visual mode, this parameter is generally not required.
---                     The format is consistent with the LSP Protocol.
---            - line_range: (table) An array [start_line, end_line], which has the same effect as range. Lines are zero indexed
---            - leave_selection: (boolean) Whether to preserve the selected range, only valid when range or line_range is specified
---@param timeout? number Timeout in milliseconds. The default value is -1, which means no timeout.
---
---@return any: result
function M.call(name, opts, timeout)
  vim.validate({
    name = { name, "string" },
    opts = { opts, "table", true },
    timeout = { timeout, "number", true },
  })
  opts = opts or {}
  vim.validate({
    ["opts.callback"] = { opts.callback, "nil" },
    ["opts.args"] = { opts.args, "t", true },
    ["opts.range"] = { opts.range, "t", true },
    ["opts.line_range"] = { opts.line_range, "t", true },
    ["opts.leave_selection"] = { opts.leave_selection, "b", true },
  })
  timeout = timeout or -1

  if opts.range and opts.line_range then
    error([[Cannot specify both "range" and "line_range"]])
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

------- Event Hooks -------

local EVENT_STATE = {}

--[[
List of events:

event -> args
-------------
init -> ()
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

------- VSCode settings integration -------

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

return M
