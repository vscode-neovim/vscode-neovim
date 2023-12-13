" Set global flag to allow checking in custom user config
let g:vscode = 1

let s:currDir = fnamemodify(resolve(expand('<sfile>:p')), ':h')
" Adjust rtp path
let &runtimepath = &runtimepath . ',' . s:currDir . '/vim-altercmd'

let s:runtimePath = fnamemodify(s:currDir, ':h') . '/runtime'
let &runtimepath = &runtimepath . ',' . s:runtimePath

lua << EOF
local MIN_VERSION = "0.9.0"

local outdated = not (vim.version and vim.version.parse)
if not outdated then
  local cur = vim.version()
  local min = vim.version.parse(MIN_VERSION)
  outdated = vim.version.lt(cur, min)
end
if outdated then
  local msg = "vscode-neovim requires nvim version "
    .. MIN_VERSION
    .. " or higher. Install the [latest stable version](https://github.com/neovim/neovim/releases/latest)."
  vim.rpcnotify(vim.g.vscode_channel, "vscode-action", "notify", { args = { msg, "error" } })
end
EOF

" Used for externsion inter-communications
let s:vscodePluginEventName = 'vscode-neovim'

" RPC and global functions

" internal

function! VSCodeExtensionNotify(cmd, ...)
    call rpcnotify(g:vscode_channel, s:vscodePluginEventName, a:cmd, a:000)
endfunction

" apis

function! VSCodeCall(cmd, ...) abort
    call luaeval('require"vscode-neovim".call(_A[1], {args = _A[2]})', [a:cmd, a:000])
endfunction

function! VSCodeNotify(cmd, ...)
    call luaeval('require"vscode-neovim".action(_A[1], {args = _A[2]})', [a:cmd, a:000])
endfunction

function! VSCodeCallRange(cmd, line1, line2, leaveSelection, ...) abort
    call luaeval('require"vscode-neovim".call(_A[1], { range = _A[2], restore_selection=_A[3], args = _A[4] })',
          \ [a:cmd, [a:line1 - 1, a:line2 - 1], a:leaveSelection ? v:false : v:true, a:000])
endfunction

function! VSCodeNotifyRange(cmd, line1, line2, leaveSelection, ...)
    call luaeval('require"vscode-neovim".action(_A[1], { range = _A[2], restore_selection=_A[3], args = _A[4] })',
          \ [a:cmd, [a:line1 - 1, a:line2 - 1], a:leaveSelection ? v:false : v:true, a:000])
endfunction

function! VSCodeCallRangePos(cmd, line1, line2, pos1, pos2, leaveSelection, ...) abort
    call luaeval('require"vscode-neovim".call(_A[1], { range = _A[2], restore_selection=_A[3], args = _A[4] })',
          \ [a:cmd, [a:line1 - 1, a:pos1 - 1, a:line2 - 1, a:pos2 - 1], a:leaveSelection ? v:false : v:true, a:000])
endfunction

function! VSCodeNotifyRangePos(cmd, line1, line2, pos1, pos2, leaveSelection, ...)
    call luaeval('require"vscode-neovim".action(_A[1], { range = _A[2], restore_selection=_A[3], args = _A[4] })',
          \ [a:cmd, [a:line1 - 1, a:pos1 - 1, a:line2 - 1, a:pos2 - 1], a:leaveSelection ? v:false : v:true, a:000])
endfunction

" Called from extension when opening/creating new file in vscode to reset undo tree
function! VSCodeClearUndo(bufId)
    let oldlevels = &undolevels
    call nvim_buf_set_option(a:bufId, 'undolevels', -1)
    call nvim_buf_set_lines(a:bufId, 0, 0, 0, [])
    call nvim_buf_set_option(a:bufId, 'undolevels', oldlevels)
    unlet oldlevels
endfunction

function! s:onInsertEnter()
    let reg = reg_recording()
    if !empty(reg)
        call VSCodeExtensionNotify('notify-recording', reg)
    endif
endfunction


" Load altercmd first
execute 'source ' . s:currDir . '/vim-altercmd/plugin/altercmd.vim'
execute 'source ' . s:currDir . '/vscode-scrolling.vim'
execute 'source ' . s:currDir . '/vscode-jumplist.vim'
execute 'source ' . s:currDir . '/vscode-code-actions.vim'
execute 'source ' . s:currDir . '/vscode-file-commands.vim'
execute 'source ' . s:currDir . '/vscode-tab-commands.vim'
execute 'source ' . s:currDir . '/vscode-window-commands.vim'
execute 'source ' . s:currDir . '/vscode-motion.vim'

augroup VscodeGeneral
    autocmd!
    " autocmd BufWinEnter,WinNew,WinEnter * :only
    autocmd BufWinEnter * call VSCodeExtensionNotify('external-buffer', getbufinfo(bufnr())[0], &et, &ts)
    " Help and other buffer types may explicitly disable line numbers - reenable them, !important - set nowrap since it may be overriden and this option is crucial for now
    " autocmd FileType * :setlocal conceallevel=0 | :setlocal number | :setlocal numberwidth=8 | :setlocal nowrap | :setlocal nofoldenable
    autocmd InsertEnter * call <SID>onInsertEnter()
    " Trigger filetype detection
    autocmd BufAdd * do BufRead
    " Looks like external windows are coming with "set wrap" set automatically, disable them
    " autocmd WinNew,WinEnter * :set nowrap
    autocmd WinScrolled * call VSCodeExtensionNotify('window-scroll', win_getid(), winsaveview())
    autocmd VimEnter,ModeChanged * call VSCodeExtensionNotify('mode-changed', mode())
    autocmd WinEnter * call VSCodeExtensionNotify('window-changed', win_getid())
    " LazyVim will clear runtimepath by default. To avoid user intervention, we need to set it again.
    autocmd User LazyDone let &runtimepath = &runtimepath . ',' . s:runtimePath
    " Source config "afterInitConfig"
    autocmd VimEnter * call nvim_exec2(join(v:lua.require("vscode-neovim").get_config("vscode-neovim.afterInitConfig"), "\n"), {})
augroup END


lua require("vscode-neovim")
runtime! modules/**/*.{vim,lua}
