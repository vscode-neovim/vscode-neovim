set shortmess="filnxtToOFI"
set nowrap
set mouse=a
set cmdheight=1
set wildmode=list

set nobackup
set nowb
set noswapfile
set noautoread

" do not hide buffers
set nohidden
" do not attempt autowrite any buffers
set noautowrite
" Disable shada session storing
" set shada=

let s:currDir = fnamemodify(resolve(expand('<sfile>:p')), ':h')
" Adjust rtp path
let &runtimepath = &runtimepath . ',' . s:currDir . '/vim-altercmd'

" Used to execute vscode command
let s:vscodeCommandEventName = "vscode-command"
" Used to execute vscode command with some range (the specified range will be selected and the command will be executed on this range)
let s:vscodeRangeCommandEventName = "vscode-range-command"
" Used for externsion inter-communications
let s:vscodePluginEventName = "vscode-neovim"

" RPC and global functions

function! VSCodeCall(cmd, ...)
    call rpcrequest(g:vscode_channel, s:vscodeCommandEventName, a:cmd, a:000)
endfunction

function! VSCodeCallRange(cmd, line1, line2, ...)
    call rpcrequest(g:vscode_channel, s:vscodeRangeCommandEventName, a:cmd, a:line1, a:line2, a:000)
endfunction

function! VSCodeNotify(cmd, ...)
    call rpcnotify(g:vscode_channel, s:vscodeCommandEventName, a:cmd, a:000)
endfunction

function! VSCodeNotifyRange(cmd, line1, line2, ...)
    call rpcnotify(g:vscode_channel, s:vscodeRangeCommandEventName, a:cmd, a:line1, a:line2, a:000)
endfunction

function! VSCodeExtensionCall(cmd, ...)
    call rpcrequest(g:vscode_channel, s:vscodePluginEventName, a:cmd, a:000)
endfunction

function! VSCodeExtensionNotify(cmd, ...)
    call rpcnotify(g:vscode_channel, s:vscodePluginEventName, a:cmd, a:000)
endfunction

" Called from extension when opening/creating new file in vscode to reset undo tree
function! VSCodeClearUndo()
    let oldlevels = &undolevels
    set undolevels=-1
    exe "normal a \<BS>\<Esc>"
    let &undolevels = oldlevels
    unlet oldlevels
endfunction

" Called from extension to align screen row in neovim after scrolling
function! VSCodeAlignScreenRow(row)
    let currentRow = winline()
    let diff = abs(currentRow - a:row)
    if diff > 0
        if (a:row - currentRow) < 0
            if diff > 1
                silent! exe "normal! " . diff . "\<C-e>"
            else
                silent! exe "normal! \<C-e>"
            endif
        else
            if diff > 1
                silent! exe "normal! " . diff . "\<C-y>"
            else
                silent! exe "normal! \<C-y>"
            endif
        endif
    endif
endfunction

" Set text decorations for given ranges. Used in easymotion
function! VSCodeSetTextDecorations(hlName, rowsCols)
    call VSCodeExtensionNotify('text-decorations', a:hlName, a:rowsCols)
endfunction

" Used for ctrl-a insert keybinding
function! VSCodeGetLastInsertText()
    let line1 = line("'[")
    let line2 = line("']")
    if (line1 == 0)
        return []
    endif
    let lines = []
    for i in range(line1, line2)
        call add(lines, getline(i))
    endfor
    return lines
endfunction

" Used for ctrl-r [reg] insert keybindings
function! VSCodeGetRegister(reg)
    return getreg(a:reg)
endfunction

function! s:notifyBlockingModeStart()
    let cursor = nvim_win_get_cursor(0)
    let winline = winline()
    call VSCodeExtensionCall('notify-blocking', 1, cursor, winline)
endfunction

function! s:notifyBlockingModeEnd()
    call VSCodeExtensionCall('notify-blocking', 0)
endfunction

" This is called by extension when created new buffer
function! s:onBufEnter(name, id)
    " Sometimes doesn't work, although on extensions we handle such buffers
    let controlled = getbufvar(a:id, "vscode_controlled")
    if !controlled
        call VSCodeExtensionCall('external-buffer', a:name, a:id)
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

autocmd BufWinEnter,WinNew,WinEnter * :only
autocmd BufWinEnter * :call <SID>onBufEnter(expand('<afile>'), expand('<abuf>'))
" Disable syntax highlighting since we don't need it anyway
autocmd BufWinEnter * :syntax off
autocmd CmdlineEnter * :call <SID>notifyBlockingModeStart()
autocmd CmdlineLeave * :call <SID>notifyBlockingModeEnd()

