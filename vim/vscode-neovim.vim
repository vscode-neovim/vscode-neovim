set shortmess="filnxtToOFI"
set nowrap
set wildchar=9
set mouse=a
set cmdheight=1

set nobackup
set nowb
set noswapfile
set noautoread

" do not hide buffers
set nohidden
" do not attempt autowrite any buffers
set noautowrite

let s:vscodeCommandEventName = "vscode-command"
let s:vscodePluginEventName = "vscode-neovim"

function! VSCodeCall(cmd, ...)
    call rpcrequest(g:vscode_channel, s:vscodeCommandEventName, a:cmd, a:000)
endfunction

function! VSCodeNotify(cmd, ...)
    call rpcnotify(g:vscode_channel, s:vscodeCommandEventName, a:cmd, a:000)
endfunction

function! VSCodeInsertBefore()
    " Need to start insert mode first to prevent cursor updating
    startinsert
    call VSCodeCall("editor.action.insertLineBefore")
endfunction

function! VSCodeInsertAfter()
    " Need to start insert mode first to prevent cursor updating
    startinsert
    call VSCodeCall("editor.action.insertLineAfter")
endfunction

function! VSCodeClearUndo()
    let oldlevels = &undolevels
    set undolevels=-1
    exe "normal a \<BS>\<Esc>"
    let &undolevels = oldlevels
    unlet oldlevels
endfunction

function! VSCodeGetCursorPositions()
    return [0, 0]
endfunction

function! VSCodeNotifyBlockingAndCursorPositions()
    let cursor = nvim_win_get_cursor(0)
    let winline = winline()
    call rpcrequest(g:vscode_channel, s:vscodePluginEventName, "notify-blocking", 1, cursor, winline)
endfunction

function! VSCodeNotifyBlockingEnd()
    call rpcrequest(g:vscode_channel, s:vscodePluginEventName, "notify-blocking", 0)
endfunction

" This is called by extension when created new buffer
function! VSCodeOnBufWinEnter(name, id)
    " Sometimes doesn't work, although on extensions we handle such buffers
    let controlled = getbufvar(a:id, "vscode_controlled")
    if !controlled
        call rpcrequest(g:vscode_channel, s:vscodePluginEventName, "external-buffer", a:name, a:id)
    endif
endfunction

function! VSCodeSetTextDecorations(hlName, rowsCols)
    call rpcrequest(g:vscode_channel, s:vscodePluginEventName, "text-decorations", a:hlName, a:rowsCols)
endfunction

autocmd BufWinEnter,WinNew,WinEnter * :only
autocmd BufWinEnter * :call VSCodeOnBufWinEnter(expand('<afile>'), expand('<abuf>'))
autocmd CmdlineEnter * :call VSCodeNotifyBlockingAndCursorPositions()
autocmd CmdlineLeave * :call VSCodeNotifyBlockingEnd()

nnoremap <silent> O :call VSCodeInsertBefore()<CR>
nnoremap <silent> o :call VSCodeInsertAfter()<CR>
