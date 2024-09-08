" Set global flag to allow checking in custom user config
let g:vscode = 1

" Setup runtimepath
let g:vscode_neovim_runtime = fnamemodify(resolve(expand('<sfile>:p')), ':h')
lua << EOF
-- Detect potential module conflicts
local dirs = vim.api.nvim_get_runtime_file("lua/vscode/", true)
local files = vim.api.nvim_get_runtime_file("lua/vscode.lua", true)
if #dirs > 0 or #files > 0 then
  for _, file in ipairs(files) do
    table.insert(dirs, file)
  end
  local msg = "vscode-neovim uses module name `vscode` which conflicts with existing modules. Please rename the module. "
    .. table.concat(dirs, ", ")
  local cmd = "await vscode.window.showErrorMessage(args)"
  vim.rpcnotify(vim.g.vscode_channel, "vscode-action", "eval", { args = { cmd, msg } })
end

vim.opt.rtp:prepend(vim.g.vscode_neovim_runtime)
EOF

" Check version
lua << EOF
local MIN_VERSION = vim.g.vscode_nvim_min_version

local cmp = -1 ---@type -1|0|1
local prerelease = false
if vim.version and vim.version.parse then
  local v = vim.version()
  local curr = { v.major, v.minor, v.patch }
  local min = vim.version.parse(MIN_VERSION)
  cmp = vim.version.cmp(curr, min)
  prerelease = not not v.prerelease
end

local warn = true
local msgs = {
  ("vscode-neovim requires nvim version %s or higher."):format(MIN_VERSION),
  "Install the [latest stable version](https://github.com/neovim/neovim/releases/latest).",
}
if cmp < 0 then
  -- nothing
elseif cmp == 0 and prerelease then
  table.insert(msgs, 2, ("Current version is a **prerelease** of %s.").format(MIN_VERSION))
else
  warn = false
end

if warn then
  vim.rpcnotify(vim.g.vscode_channel, "vscode-action", "eval", {
    args = { "vscode.window.showErrorMessage(args)", table.concat(msgs, " ") },
  })
end
EOF

" Load altercmd
" {{{
" altercmd - Alter built-in Ex commands by your own ones
" Version: 0.0.1
" Copyright (C) 2009-2015 Kana Natsuno <http://whileimautomaton.net/>
" License: MIT license
function! s:altercmd_define(...)
    let [buffer, original_name, alternate_name]
    \ = (a:000[0] ==? '<buffer>' ? [] : ['']) + a:000

    if original_name =~ '\['
      let [original_name_head, original_name_tail] = split(original_name, '[')
      let original_name_tail = substitute(original_name_tail, '\]', '', '')
    else
      let original_name_head = original_name
      let original_name_tail = ''
    endif

    let original_name_tail = ' ' . original_name_tail
    for i in range(len(original_name_tail))
      let lhs = original_name_head . original_name_tail[1:i]
      execute 'cnoreabbrev <expr>' buffer lhs
      \ '(getcmdtype() == ":" && getcmdline() ==# "' . lhs  . '")'
      \ '?' ('"' . alternate_name . '"')
      \ ':' ('"' . lhs . '"')
    endfor
  endfunction

command! -bar -complete=command -nargs=* AlterCommand call s:altercmd_define(<f-args>)
" }}}

" RPC and global functions

" internal

function! VSCodeExtensionNotify(cmd, ...)
    call rpcnotify(g:vscode_channel, 'vscode-neovim', a:cmd, a:000)
endfunction

" apis

function! VSCodeCall(cmd, ...) abort
    call luaeval('require"vscode".call(_A[1], {args = _A[2]})', [a:cmd, a:000])
endfunction

function! VSCodeNotify(cmd, ...)
    call luaeval('require"vscode".action(_A[1], {args = _A[2]})', [a:cmd, a:000])
endfunction

function! VSCodeCallRange(cmd, line1, line2, leaveSelection, ...) abort
    call luaeval('require"vscode".call(_A[1], { range = _A[2], restore_selection=_A[3], args = _A[4] })',
          \ [a:cmd, [a:line1 - 1, a:line2 - 1], a:leaveSelection ? v:false : v:true, a:000])
endfunction

function! VSCodeNotifyRange(cmd, line1, line2, leaveSelection, ...)
    call luaeval('require"vscode".action(_A[1], { range = _A[2], restore_selection=_A[3], args = _A[4] })',
          \ [a:cmd, [a:line1 - 1, a:line2 - 1], a:leaveSelection ? v:false : v:true, a:000])
endfunction

function! VSCodeCallRangePos(cmd, line1, line2, pos1, pos2, leaveSelection, ...) abort
    call luaeval('require"vscode".call(_A[1], { range = _A[2], restore_selection=_A[3], args = _A[4] })',
          \ [a:cmd, [a:line1 - 1, a:pos1 - 1, a:line2 - 1, a:pos2 - 1], a:leaveSelection ? v:false : v:true, a:000])
endfunction

function! VSCodeNotifyRangePos(cmd, line1, line2, pos1, pos2, leaveSelection, ...)
    call luaeval('require"vscode".action(_A[1], { range = _A[2], restore_selection=_A[3], args = _A[4] })',
          \ [a:cmd, [a:line1 - 1, a:pos1 - 1, a:line2 - 1, a:pos2 - 1], a:leaveSelection ? v:false : v:true, a:000])
endfunction

function! s:onInsertEnter()
    let reg = reg_recording()
    if !empty(reg)
        call VSCodeExtensionNotify('notify-recording', reg)
    endif
    " Hack to disable `type` unbinding during insert mode by triggering recording mode to add support for vim-visual-multi
    " https://github.com/vscode-neovim/vscode-neovim/pull/1755
    if exists("b:VM_Selection") && !empty(b:VM_Selection)
        call VSCodeExtensionNotify('notify-recording', reg)
    endif
endfunction

augroup VscodeGeneral
    autocmd!
    autocmd BufWinEnter * call VSCodeExtensionNotify('external-buffer', getbufinfo(bufnr())[0], &et, &ts)
    autocmd InsertEnter * call <SID>onInsertEnter()
    " Trigger filetype detection
    autocmd BufAdd * do BufRead
    autocmd VimEnter,ModeChanged * call VSCodeExtensionNotify('mode-changed', mode())
    autocmd WinEnter * call VSCodeExtensionNotify('window-changed', win_getid())
    " LazyVim will clear runtimepath by default. To avoid user intervention, we need to set it again.
    autocmd User LazyDone let &runtimepath = g:vscode_neovim_runtime . ',' . &runtimepath
    " Source config "afterInitConfig"
    autocmd VimEnter * call nvim_exec2(join(v:lua.require("vscode").get_config("vscode-neovim.afterInitConfig"), "\n"), {})
augroup END

" TODO: Remove when dropping support for nvim 0.9
lua vim.islist = vim.islist or vim.tbl_islist

lua require("vscode")
runtime! vscode/**/*.{vim,lua}
