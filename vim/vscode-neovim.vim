" Set global flag to allow checking in custom user config
let g:vscode = 1

let s:currDir = fnamemodify(resolve(expand('<sfile>:p')), ':h')
" Adjust rtp path
let &runtimepath = &runtimepath . ',' . s:currDir . '/vim-altercmd'

let s:luaPath = fnamemodify(s:currDir, ':h') . '/runtime'
let &runtimepath = &runtimepath . ',' . s:luaPath

" Used to execute vscode command
let s:vscodeCommandEventName = 'vscode-command'
" Used to execute vscode command with some range (the specified range will be selected and the command will be executed on this range)
let s:vscodeRangeCommandEventName = 'vscode-range-command'
" Used for externsion inter-communications
let s:vscodePluginEventName = 'vscode-neovim'

" RPC and global functions

function! VSCodeCall(cmd, ...) abort
    call rpcrequest(g:vscode_channel, s:vscodeCommandEventName, a:cmd, a:000)
endfunction

function! VSCodeNotify(cmd, ...)
    call rpcnotify(g:vscode_channel, s:vscodeCommandEventName, a:cmd, a:000)
endfunction

function! VSCodeCallRange(cmd, line1, line2, leaveSelection, ...) abort
    call rpcrequest(g:vscode_channel, s:vscodeRangeCommandEventName, a:cmd, a:line1, a:line2, 0, 0, a:leaveSelection, a:000)
endfunction

function! VSCodeNotifyRange(cmd, line1, line2, leaveSelection, ...)
    call rpcnotify(g:vscode_channel, s:vscodeRangeCommandEventName, a:cmd, a:line1, a:line2, 0, 0, a:leaveSelection, a:000)
endfunction

function! VSCodeCallRangePos(cmd, line1, line2, pos1, pos2, leaveSelection, ...) abort
    call rpcrequest(g:vscode_channel, s:vscodeRangeCommandEventName, a:cmd, a:line1, a:line2, a:pos1, a:pos2, a:leaveSelection, a:000)
endfunction

function! VSCodeNotifyRangePos(cmd, line1, line2, pos1, pos2, leaveSelection, ...)
    call rpcnotify(g:vscode_channel, s:vscodeRangeCommandEventName, a:cmd, a:line1, a:line2, a:pos1, a:pos2, a:leaveSelection, a:000)
endfunction

function! VSCodeExtensionCall(cmd, ...) abort
    call rpcrequest(g:vscode_channel, s:vscodePluginEventName, a:cmd, a:000)
endfunction

function! VSCodeExtensionNotify(cmd, ...)
    call rpcnotify(g:vscode_channel, s:vscodePluginEventName, a:cmd, a:000)
endfunction

function! s:fixVisualPos(startPos, endPos)
    if (a:startPos[1] == a:endPos[1] && a:startPos[2] > a:endPos[2]) || a:startPos[1] > a:endPos[1]
        let a:startPos[2] = a:startPos[2] + 1
    else
        let a:endPos[2] = a:endPos[2] + 1
    endif
    return [a:startPos, a:endPos]
endfunction

function! VSCodeCallVisual(cmd, leaveSelection, ...) abort
    let mode = mode()
    if mode ==# 'V'
        let startLine = line('v')
        let endLine = line('.')
        call VSCodeCallRange(a:cmd, startLine, endLine, a:leaveSelection, a:000)
    elseif mode ==# 'v' || mode ==# "\<C-v>"
        let startPos = getpos('v')
        let endPos = getpos('.')
        let [startPos, endPos] = s:fixVisualPos(startPos, endPos)
        call VSCodeCallRangePos(a:cmd, startPos[1], endPos[1], startPos[2], endPos[2], a:leaveSelection, a:000)
    else
        call VSCodeCall(a:cmd, a:000)
    endif
endfunction

function! VSCodeNotifyVisual(cmd, leaveSelection, ...)
    let mode = mode()
    if mode ==# 'V'
        let startLine = line('v')
        let endLine = line('.')
        call VSCodeNotifyRange(a:cmd, startLine, endLine, a:leaveSelection, a:000)
    elseif mode ==# 'v' || mode ==# "\<C-v>"
        let startPos = getpos('v')
        let endPos = getpos('.')
        let [startPos, endPos] = s:fixVisualPos(startPos, endPos)
        call VSCodeNotifyRangePos(a:cmd, startPos[1], endPos[1], startPos[2], endPos[2], a:leaveSelection, a:000)
    else
        call VSCodeNotify(a:cmd, a:000)
    endif
endfunction

" Called from extension when opening/creating new file in vscode to reset undo tree
function! VSCodeClearUndo(bufId)
    let oldlevels = &undolevels
    call nvim_buf_set_option(a:bufId, 'undolevels', -1)
    call nvim_buf_set_lines(a:bufId, 0, 0, 0, [])
    call nvim_buf_set_option(a:bufId, 'undolevels', oldlevels)
    unlet oldlevels
endfunction


" Set text decorations for given ranges. Used in easymotion
function! VSCodeSetTextDecorations(hlName, rowsCols)
    call VSCodeExtensionNotify('text-decorations', a:hlName, a:rowsCols)
endfunction

" This is called by extension when created new buffer
function! s:onBufEnter(name, id)
    if exists('b:vscode_temp') && b:vscode_temp
        return
    endif
    set conceallevel=0
    let tabstop = &tabstop
    let isJumping = 0
    if exists('g:isJumping')
        let isJumping = g:isJumping
    endif
    call VSCodeExtensionCall('external-buffer', a:name, a:id, 1, tabstop, isJumping)
endfunction

function! s:runFileTypeDetection()
    doautocmd BufRead
    if exists('b:vscode_controlled') && b:vscode_controlled
        " make sure we disable syntax (global option seems doesn't take effect for 2nd+ windows)
        setlocal syntax=off
    endif
endfunction

function! s:onInsertEnter()
    let reg = reg_recording()
    if !empty(reg)
        call VSCodeExtensionCall('notify-recording', reg)
    endif
endfunction


" Load altercmd first
execute 'source ' . s:currDir . '/vim-altercmd/plugin/altercmd.vim'
execute 'source ' . s:currDir . '/vscode-insert.vim'
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
    autocmd BufWinEnter * call <SID>onBufEnter(expand('<afile>'), expand('<abuf>'))
    " Help and other buffer types may explicitly disable line numbers - reenable them, !important - set nowrap since it may be overriden and this option is crucial for now
    " autocmd FileType * :setlocal conceallevel=0 | :setlocal number | :setlocal numberwidth=8 | :setlocal nowrap | :setlocal nofoldenable
    autocmd InsertEnter * call <SID>onInsertEnter()
    autocmd BufAdd * call <SID>runFileTypeDetection()
    " Looks like external windows are coming with "set wrap" set automatically, disable them
    " autocmd WinNew,WinEnter * :set nowrap
    autocmd WinScrolled * call VSCodeExtensionNotify('window-scroll', win_getid(), winsaveview())
    autocmd ModeChanged * call VSCodeExtensionNotify('mode-changed', v:event.old_mode, v:event.new_mode)
augroup END


lua << EOF
require("vscode")
EOF
