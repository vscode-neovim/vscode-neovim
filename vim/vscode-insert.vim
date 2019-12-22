
function! s:vscodeInsertBefore()
    call VSCodeExtensionNotify('insert-line', 'before')
endfunction

function! s:vscodeInsertAfter()
    call VSCodeExtensionNotify('insert-line', 'after')
endfunction

function! s:vscodeMultipleCursorsVisualMode(append, skipEmpty)
    let m = visualmode()
    if m == "V" || m == "\<C-v>"
        startinsert
        call VSCodeExtensionNotify('visual-edit', a:append, m, line("'<"), line("'>"), a:skipEmpty)
    endif
endfunction

nnoremap <silent> O :<C-u> call<SID>vscodeInsertBefore()<CR>
nnoremap <silent> o :<C-u> call<SID>vscodeInsertAfter()<CR>

" Multiple cursors support for visual line/block modes
xnoremap <silent> ma :<C-u>call <SID>vscodeMultipleCursorsVisualMode(1, 1)<CR>
xnoremap <silent> mi :<C-u>call <SID>vscodeMultipleCursorsVisualMode(0, 1)<CR>
xnoremap <silent> mA :<C-u>call <SID>vscodeMultipleCursorsVisualMode(1, 0)<CR>
xnoremap <silent> mI :<C-u>call <SID>vscodeMultipleCursorsVisualMode(0, 0)<CR>
