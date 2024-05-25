-- Support preview list when inccommand is set to split. Mainly for 'substitute'

local api, fn = vim.api, vim.fn

local function get_lines()
  -- Find preview buffer --

  local preview_buf
  local bufs = api.nvim_list_bufs()
  for _, buf in ipairs(bufs) do
    if
      vim.bo[buf].buftype == "nofile"
      and fn.bufname(buf) == "[Preview]"
      and fn.getbufoneline(buf, 1):match("%d+|")
    then
      preview_buf = buf
      break
    end
  end

  -- return items --

  if not preview_buf then
    return
  end

  return api.nvim_buf_get_lines(preview_buf, 0, -1, false)
end

local re = vim.regex([[\(s\|su\|substitute\)/.]])

local function refresh_completion()
  if
    not vim.g.vscode_channel
    or vim.opt.icm:get() ~= "split"
    or fn.getcmdtype() ~= ":"
    or not re:match_str(fn.getcmdline())
  then
    return
  end
  local lines = get_lines()
  if lines then
    local items = {}
    for _, line in ipairs(lines) do
      table.insert(items, { line, "", "", "" })
    end
    vim.rpcnotify(vim.g.vscode_channel, "redraw", { "popupmenu_show", { items, -1, 0, 0, -1 } })
  end
end

api.nvim_create_autocmd({ "CmdlineChanged" }, {
  group = api.nvim_create_augroup("vscode.inccommand", {}),
  callback = function()
    vim.schedule(refresh_completion)
  end,
})
