function! s:vscodeFormat(...) abort
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

function! s:vscodeCommentary(...) abort
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

command! -range -bar VSCodeCommentary call s:vscodeCommentary(<line1>, <line2>)

xnoremap <expr> <Plug>VSCodeCommentary <SID>vscodeCommentary()
nnoremap <expr> <Plug>VSCodeCommentary <SID>vscodeCommentary()
nnoremap <expr> <Plug>VSCodeCommentaryLine <SID>vscodeCommentary() . '_'

" Bind format to vscode format selection
xnoremap <expr> = <SID>vscodeFormat()
nnoremap <expr> = <SID>vscodeFormat()
nnoremap <expr> == <SID>vscodeFormat() . '_'

" gf/gF . Map to go to definition for now
nnoremap <silent> <expr> gf VSCodeCall('editor.action.goToTypeDefinition')
nnoremap <silent> <expr> gF VSCodeCall('editor.action.revealDefinition')
xnoremap <silent> <expr> gf VSCodeCall('editor.action.goToTypeDefinition')
xnoremap <silent> <expr> gF VSCodeCall('editor.action.revealDefinition')
" <C-w> gf opens definition on the side
nnoremap <silent> <expr> <C-w>gf VSCodeCall('editor.action.revealDefinitionAside')
nnoremap <silent> <expr> <C-w>gF VSCodeCall('editor.action.revealDefinitionAside')
xnoremap <silent> <expr> <C-w>gf VSCodeCall('editor.action.revealDefinitionAside')
xnoremap <silent> <expr> <C-w>gF VSCodeCall('editor.action.revealDefinitionAside')