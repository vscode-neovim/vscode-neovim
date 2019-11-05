set shortmess="filnxtToOFI"
set nowrap
set wildchar=9
set mouse=a
set cmdheight=1

set nobackup
set nowb
set noswapfile
set noautoread

let s:eventName = "vscode-neovim"

function! VSCodeCall(cmd, ...)
    call rpcrequest(g:vscode_channel, s:eventName, a:cmd, a:000)
endfunction

function! VSCodeNotify(cmd, ...)
    call rpcnotify(g:vscode_channel, s:eventName, a:cmd, a:000)
endfunction

function! VSCodeInsertBefore()
    call VSCodeCall("editor.action.insertLineBefore")
    startinsert
endfunction

function! VSCodeInsertAfter()
    let currpos = getcurpos()
    call VSCodeCall("editor.action.insertLineAfter")
    call cursor(currpos[1] + 1, 99999)
    startinsert
endfunction

function! VSCodeClearUndo()
    let oldlevels = &undolevels
    set undolevels=-1
    exe "normal a \<BS>\<Esc>"
    let &undolevels = oldlevels
    unlet oldlevels
endfunction

nnoremap <silent> O :call VSCodeInsertBefore()<CR>
nnoremap <silent> o :call VSCodeInsertAfter()<CR>
