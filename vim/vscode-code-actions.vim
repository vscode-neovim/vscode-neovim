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

function! s:vscodeGoToDefinition(str)
    if exists('b:vscode_controlled') && b:vscode_controlled
        exe "normal! m'"
        call VSCodeNotify("editor.action.reveal" . a:str)
    else
        " Allow to funcionar in help files
        exe "normal! \<C-]>"
    endif
endfunction

function! s:vscodeNotifyWithMark(command)
  normal! m'
  call VSCodeNotify(a:command)
endfunction

function! s:openVSCodeCommandsInVisualMode()
    let visualmode = visualmode()
    if visualmode ==# "V"
        let startLine = line("v")
        let endLine = line(".")
        call VSCodeNotifyRange("workbench.action.showCommands", startLine, endLine, 1)
    else
        let startPos = getpos("v")
        let endPos = getpos(".")
        call VSCodeNotifyRangePos("workbench.action.showCommands", startPos[1], endPos[1], startPos[2], endPos[2] + 1, 1)
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
nnoremap <silent> K <Cmd>call VSCodeNotify('editor.action.showHover')<CR>
nnoremap <silent> gh <Cmd>call VSCodeNotify('editor.action.showHover')<CR>
nnoremap <silent> gf <Cmd>call <SID>vscodeGoToDefinition("Declaration")<CR>
nnoremap <silent> gd <Cmd>call <SID>vscodeGoToDefinition("Definition")<CR>
nnoremap <silent> <C-]> <Cmd>call <SID>vscodeGoToDefinition("Definition")<CR>
nnoremap <silent> gO <Cmd>call <SID>vscodeNotifyWithMark('workbench.action.gotoSymbol')<CR>
nnoremap <silent> gF <Cmd>call VSCodeNotify('editor.action.peekDeclaration')<CR>
nnoremap <silent> gD <Cmd>call VSCodeNotify('editor.action.peekDefinition')<CR>
nnoremap <silent> gH <Cmd>call VSCodeNotify('editor.action.referenceSearch.trigger')<CR>

xnoremap <silent> K <Cmd>call VSCodeNotify('editor.action.showHover')<CR>
xnoremap <silent> gh <Cmd>call VSCodeNotify('editor.action.showHover')<CR>
xnoremap <silent> gf <Cmd>call <SID>vscodeGoToDefinition("Declaration")<CR>
xnoremap <silent> gd <Cmd>call <SID>vscodeGoToDefinition("Definition")<CR>
xnoremap <silent> <C-]> <Cmd>call <SID>vscodeGoToDefinition("Definition")<CR>
xnoremap <silent> gO <Cmd>call <SID>vscodeNotifyWithMark('workbench.action.gotoSymbol')<CR>
xnoremap <silent> gF <Cmd>call VSCodeNotify('editor.action.peekDeclaration')<CR>
xnoremap <silent> gD <Cmd>call VSCodeNotify('editor.action.peekDefinition')<CR>
xnoremap <silent> gH <Cmd>call VSCodeNotify('editor.action.referenceSearch.trigger')<CR>

" <C-w> gf opens definition on the side
nnoremap <silent> <C-w>gf <Cmd>call VSCodeNotify('editor.action.revealDeclarationAside')<CR>
nnoremap <silent> <C-w>gd <Cmd>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
xnoremap <silent> <C-w>gf <Cmd>call VSCodeNotify('editor.action.revealDeclarationAside')<CR>
xnoremap <silent> <C-w>gd <Cmd>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>

" Bind C-/ to vscode commentary since calling from vscode produces double comments due to multiple cursors
xnoremap <expr> <C-/> <SID>vscodeCommentary()
nnoremap <expr> <C-/> <SID>vscodeCommentary() . '_'

" Workaround for gk/gj
nnoremap gk <Cmd>call VSCodeCall('cursorMove', { 'to': 'up', 'by': 'wrappedLine', 'value': v:count ? v:count : 1 })<CR>
nnoremap gj <Cmd>call VSCodeCall('cursorMove', { 'to': 'down', 'by': 'wrappedLine', 'value': v:count ? v:count : 1 })<CR>

" workaround for calling command picker in visual mode
xnoremap <silent> <C-P> <Cmd>call <SID>openVSCodeCommandsInVisualMode()<CR>
