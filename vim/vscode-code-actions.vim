function! s:vscodeFormat(...) abort
    if !a:0
        let &operatorfunc = matchstr(expand('<sfile>'), '[^. ]*$')
        return 'g@'
    elseif a:0 > 1
        let [line1, line2] = [a:1, a:2]
    else
        let [line1, line2] = [line("'["), line("']")]
    endif

    call VSCodeCallRange("editor.action.formatSelection", line1, line2, 0)
endfunction

function! s:vscodeCommentary(...) abort
    if !a:0
        let &operatorfunc = matchstr(expand('<sfile>'), '[^. ]*$')
        return 'g@'
    elseif a:0 > 1
        let [line1, line2] = [a:1, a:2]
    else
        let [line1, line2] = [line("'["), line("']")]
    endif

    call VSCodeCallRange("editor.action.commentLine", line1, line2, 0)
endfunction

function! s:vscodeGoToDefinition()
    if exists('b:vscode_controlled') && b:vscode_controlled
        exe "normal! m'"
        call VSCodeNotify("editor.action.revealDefinition")
    else
        " Allow to funcionar in help files
        exe "normal! \<C-]>"
    endif
endfunction

function! s:hover()
  normal! gv
  call VSCodeNotify('editor.action.showHover')
endfunction

function! s:openVSCodeCommandsInVisualMode()
    normal! gv
    let visualmode = visualmode()
    if visualmode == "V"
        let startLine = line("v")
        let endLine = line(".")
        call VSCodeNotifyRange("workbench.action.showCommands", startLine, endLine, 1)
    else
        let startPos = getpos("v")
        let endPos = getpos(".")
        call VSCodeNotifyRangePos("workbench.action.showCommands", startPos[1], endPos[1], startPos[2], endPos[2], 1)
    endif
endfunction

command! -range -bar VSCodeCommentary call s:vscodeCommentary(<line1>, <line2>)

xnoremap <expr> <Plug>VSCodeCommentary <SID>vscodeCommentary()
nnoremap <expr> <Plug>VSCodeCommentary <SID>vscodeCommentary()
nnoremap <expr> <Plug>VSCodeCommentaryLine <SID>vscodeCommentary() . '_'

" Bind format to vscode format selection
xnoremap <expr> = <SID>vscodeFormat()
nnoremap <expr> = <SID>vscodeFormat()
nnoremap <expr> == <SID>vscodeFormat() . '_'

" gf/gF . Map to go to definition for now
nnoremap <silent> gf :<C-u>call <SID>vscodeGoToDefinition()<CR>
nnoremap <silent> gd :<C-u>call <SID>vscodeGoToDefinition()<CR>
nnoremap <silent> gh :<C-u>call VSCodeNotify('editor.action.showHover')<CR>
nnoremap <silent> <C-]> :<C-u>call <SID>vscodeGoToDefinition()<CR>
nnoremap <silent> gF :<C-u>call VSCodeNotify('editor.action.peekDefinition')<CR>
nnoremap <silent> gD :<C-u>call VSCodeNotify('editor.action.peekDefinition')<CR>

xnoremap <silent> gf :<C-u>call <SID>vscodeGoToDefinition()<CR>
xnoremap <silent> gd :<C-u>call <SID>vscodeGoToDefinition()<CR>
xnoremap <silent> gh :<C-u>call <SID>hover()<CR>
xnoremap <silent> <C-]> :<C-u>call <SID>vscodeGoToDefinition()<CR>
xnoremap <silent> gF :<C-u>call VSCodeNotify('editor.action.peekDefinition')<CR>
xnoremap <silent> gD :<C-u>call VSCodeNotify('editor.action.peekDefinition')<CR>
" <C-w> gf opens definition on the side
nnoremap <silent> <C-w>gf :<C-u>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
nnoremap <silent> <C-w>gd :<C-u>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
nnoremap <silent> <C-w>gF :<C-u>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
xnoremap <silent> <C-w>gf :<C-u>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
xnoremap <silent> <C-w>gd :<C-u>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
xnoremap <silent> <C-w>gF :<C-u>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>

" Bind C-/ to vscode commentary since calling from vscode produces double comments due to multiple cursors
xnoremap <expr> <C-/> <SID>vscodeCommentary()
nnoremap <expr> <C-/> <SID>vscodeCommentary() . '_'

" Workaround for gk/gj
nnoremap gk :<C-u>call VSCodeCall('cursorMove', { 'to': 'up', 'by': 'wrappedLine', 'value': v:count ? v:count : 1 })<CR>
nnoremap gj :<C-u>call VSCodeCall('cursorMove', { 'to': 'down', 'by': 'wrappedLine', 'value': v:count ? v:count : 1 })<CR>

" workaround for calling command picker in visual mode
xnoremap <silent> <C-P> :<C-u>call <SID>openVSCodeCommandsInVisualMode()<CR>
