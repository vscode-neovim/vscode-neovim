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

" This is called by extension when created new buffer
function! VSCodeOnBufWinEnter(name, id)
    let controlled = getbufvar(a:id, "vscode_controlled")
    if !controlled
        call rpcrequest(g:vscode_channel, s:vscodePluginEventName, "external-buffer", a:name, a:id)
    endif
endfunction

autocmd BufWinEnter,WinNew,WinEnter * :only
autocmd BufWinEnter * :call VSCodeOnBufWinEnter(expand('<afile>'), expand('<abuf>'))

nnoremap <silent> O :call VSCodeInsertBefore()<CR>
nnoremap <silent> o :call VSCodeInsertAfter()<CR>
