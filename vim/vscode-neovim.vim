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

function! VSCodeOnBufCreated()
    if exists("b:vscode_controlled")
        echo "Controlled"
    else
        echo "Non controlled"
    endif
endfunction

autocmd BufWinEnter,WinNew,WinEnter * :only
autocmd BufCreate * :call VSCodeOnBufCreated()

nnoremap <silent> O :call VSCodeInsertBefore()<CR>
nnoremap <silent> o :call VSCodeInsertAfter()<CR>
