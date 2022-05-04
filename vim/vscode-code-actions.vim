

function! s:vscodeFormat(...) abort
    if !a:0
        let &operatorfunc = matchstr(expand('<sfile>'), '[^. ]*$')
        return 'g@'
    elseif a:0 > 1
        let [line1, line2] = [a:1, a:2]
    else
        let [line1, line2] = [line("'["), line("']")]
    endif

    call VSCodeCallRange('editor.action.formatSelection', line1, line2, 0)
endfunction

" Bind format to vscode format selection
xnoremap <expr> = <SID>vscodeFormat()
nnoremap <expr> = <SID>vscodeFormat()
nnoremap <expr> == <SID>vscodeFormat() . '_'

function! s:vscodeCommentary(...) abort
    if !a:0
        let &operatorfunc = matchstr(expand('<sfile>'), '[^. ]*$')
        return 'g@'
    elseif a:0 > 1
        let [line1, line2] = [a:1, a:2]
    else
        let [line1, line2] = [line("'["), line("']")]
    endif

    call VSCodeCallRange('editor.action.commentLine', line1, line2, 0)
endfunction


command! -range -bar VSCodeCommentary call s:vscodeCommentary(<line1>, <line2>)

xnoremap <expr> <Plug>VSCodeCommentary <SID>vscodeCommentary()
nnoremap <expr> <Plug>VSCodeCommentary <SID>vscodeCommentary()
nnoremap <expr> <Plug>VSCodeCommentaryLine <SID>vscodeCommentary() . '_'

" Bind C-/ to vscode commentary since calling from vscode produces double comments due to multiple cursors
xnoremap <expr> <C-/> <SID>vscodeCommentary()
nnoremap <expr> <C-/> <SID>vscodeCommentary() . '_'

function! s:vscodeGoToDefinition(str)
    if exists('b:vscode_controlled') && b:vscode_controlled
        call VSCodeNotify('editor.action.' . a:str)
    else
        " Allow to function in help files
        exe "normal! \<C-]>"
    endif
endfunction

" gf/gF . Map to go to definition for now
nnoremap K <Cmd>call VSCodeNotify('editor.action.showHover')<CR>
nnoremap gh <Cmd>call VSCodeNotify('editor.action.showHover')<CR>
nnoremap gf <Cmd>call <SID>vscodeGoToDefinition('revealDeclaration')<CR>
nnoremap gd <Cmd>call <SID>vscodeGoToDefinition('revealDefinition')<CR>
nnoremap <C-]> <Cmd>call <SID>vscodeGoToDefinition('revealDefinition')<CR>
nnoremap gO <Cmd>call VSCodeNotify('workbench.action.gotoSymbol')<CR>
nnoremap gF <Cmd>call VSCodeNotify('editor.action.peekDeclaration')<CR>
nnoremap gD <Cmd>call VSCodeNotify('editor.action.peekDefinition')<CR>
nnoremap gH <Cmd>call VSCodeNotify('editor.action.referenceSearch.trigger')<CR>

xnoremap K <Cmd>call VSCodeNotify('editor.action.showHover')<CR>
xnoremap gh <Cmd>call VSCodeNotify('editor.action.showHover')<CR>
xnoremap gf <Cmd>call <SID>vscodeGoToDefinition('revealDeclaration')<CR>
xnoremap gd <Cmd>call <SID>vscodeGoToDefinition('revealDefinition')<CR>
xnoremap <C-]> <Cmd>call <SID>vscodeGoToDefinition('revealDefinition')<CR>
xnoremap gO <Cmd>call VSCodeNotify('workbench.action.gotoSymbol')<CR>
xnoremap gF <Cmd>call VSCodeNotify('editor.action.peekDeclaration')<CR>
xnoremap gD <Cmd>call VSCodeNotify('editor.action.peekDefinition')<CR>
xnoremap gH <Cmd>call VSCodeNotify('editor.action.referenceSearch.trigger')<CR>

" <C-w> gf opens definition on the side
nnoremap <C-w>gf <Cmd>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
nnoremap <C-w>gd <Cmd>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
xnoremap <C-w>gf <Cmd>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
xnoremap <C-w>gd <Cmd>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>

" open quickfix menu for spelling corrections and refactoring
" only keyboard arrows can be used to navigate, for a solution, see https://github.com/asvetliakov/vscode-neovim#keyboard-quickfix
nnoremap z= <Cmd>call VSCodeNotify('editor.action.quickFix')<CR>

" workaround for calling command picker in visual mode
xnoremap <C-P> <Cmd>call VSCodeNotifyVisual('workbench.action.quickOpen', 1)<CR>
xnoremap <C-S-P> <Cmd>call VSCodeNotifyVisual('workbench.action.showCommands', 1)<CR>
xnoremap <C-S-F> <Cmd>call VSCodeNotifyVisual('workbench.action.findInFiles', 0)<CR>
