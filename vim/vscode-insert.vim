
function! s:vscodeInsertBefore()
    startinsert
    call VSCodeCall('editor.action.insertLineBefore')
endfunction

function! s:vscodeInsertAfter()
    startinsert
    call VSCodeCall('editor.action.insertLineAfter')
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

nnoremap <silent> <expr> O <SID>vscodeInsertBefore()
nnoremap <silent> <expr> o <SID>vscodeInsertAfter()

" Multiple cursors support for visual line/block modes
xnoremap <silent> <expr> A <SID>vscodeMultipleCursorsVisualMode(1)
xnoremap <silent> <expr> I <SID>vscodeMultipleCursorsVisualMode(0)
