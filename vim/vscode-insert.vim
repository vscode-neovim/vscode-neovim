
function! s:vscodeInsertBefore()
    call VSCodeExtensionNotify('insert-line', 'before')
endfunction

function! s:vscodeInsertAfter()
    call VSCodeExtensionNotify('insert-line', 'after')
endfunction

function! s:vscodeMultipleCursorsVisualMode(append)
    let m = mode()
    if m == "V" || m == "\<C-v>"
        " Move cursors to correct positions
        call VSCodeExtensionCall('visual-edit', a:append, m)
        call wait(20, 0)
        if a:append
            let key = "a"
        else
            let key = "i"
        endif
        " Start insert mode. Normally vscode will clean multiple selections when chaning modes,
        " but we notified don't do it earlier
        call feedkeys("\<Esc>" . key, 'nt')
    endif
endfunction

nnoremap <silent> O :<C-u> call<SID>vscodeInsertBefore()<CR>
nnoremap <silent> o :<C-u> call<SID>vscodeInsertAfter()<CR>

" Multiple cursors support for visual line/block modes
xnoremap <silent> <expr> ma <SID>vscodeMultipleCursorsVisualMode(1)
xnoremap <silent> <expr> mi <SID>vscodeMultipleCursorsVisualMode(0)
