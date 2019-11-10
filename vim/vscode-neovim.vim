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
let s:vscodeRangeCommandEventName = "vscode-range-command"
let s:vscodePluginEventName = "vscode-neovim"

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

" Set text decorations for given ranges. Used in easymotion
function! VSCodeSetTextDecorations(hlName, rowsCols)
    call rpcrequest(g:vscode_channel, s:vscodePluginEventName, "text-decorations", a:hlName, a:rowsCols)
endfunction

" Used for ctrl-a insert command
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

function! VSCodeGetRegister(reg)
    return getreg(a:reg)
endfunction

function! VSCodeReveal(at, resetCursor)
    call rpcrequest(g:vscode_channel, s:vscodePluginEventName, "reveal", a:at, a:resetCursor)
endfunction

function! s:vscode_commentary(...) abort
    if !a:0
        let &operatorfunc = matchstr(expand('<sfile>'), '[^. ]*$')
        return 'g@'
    elseif a:0 > 1
        let [line1, line2] = [a:1, a:2]
    else
        let [line1, line2] = [line("'["), line("']")]
    endif

    call VSCodeCallRange("editor.action.commentLine", line1, line2)
endfunction

function! s:vscode_format(...) abort
    if !a:0
        let &operatorfunc = matchstr(expand('<sfile>'), '[^. ]*$')
        return 'g@'
    elseif a:0 > 1
        let [line1, line2] = [a:1, a:2]
    else
        let [line1, line2] = [line("'["), line("']")]
    endif

    call VSCodeCallRange("editor.action.formatSelection", line1, line2)
endfunction

command! -range -bar VSCodeCommentary call s:vscode_commentary(<line1>, <line2>)

xnoremap <expr> <Plug>VSCodeCommentary <SID>vscode_commentary()
nnoremap <expr> <Plug>VSCodeCommentary <SID>vscode_commentary()
nnoremap <expr> <Plug>VSCodeCommentaryLine <SID>vscode_commentary() . '_'

autocmd BufWinEnter,WinNew,WinEnter * :only
autocmd BufWinEnter * :call VSCodeOnBufWinEnter(expand('<afile>'), expand('<abuf>'))
autocmd CmdlineEnter * :call VSCodeNotifyBlockingAndCursorPositions()
autocmd CmdlineLeave * :call VSCodeNotifyBlockingEnd()

nnoremap <silent> O :call VSCodeInsertBefore()<CR>
nnoremap <silent> o :call VSCodeInsertAfter()<CR>

" Bind format to vscode format selection
xnoremap <expr> = <SID>vscode_format()
nnoremap <expr> = <SID>vscode_format()
nnoremap <expr> == <SID>vscode_format() . '_'

nnoremap <expr> z<CR> VSCodeReveal("top", 1)
xnoremap <expr> z<CR> VSCodeReveal("top", 1)
nnoremap <expr> zt VSCodeReveal("top", 0)
xnoremap <expr> zt VSCodeReveal("top", 0)
nnoremap <expr> z. VSCodeReveal("center", 1)
xnoremap <expr> z. VSCodeReveal("center", 1)
nnoremap <expr> zz VSCodeReveal("center", 0)
xnoremap <expr> zz VSCodeReveal("center", 0)
nnoremap <expr> z- VSCodeReveal("bottom", 1)
xnoremap <expr> z- VSCodeReveal("bottom", 1)
nnoremap <expr> zb VSCodeReveal("bottom", 0)
xnoremap <expr> zb VSCodeReveal("bottom", 0)


