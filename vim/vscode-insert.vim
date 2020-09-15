
function! s:vscodePrepareMultipleCursors(append, skipEmpty)
    let m = visualmode()
    if m ==# "V" || m ==# "\<C-v>"
        let b:notifyMultipleCursors = 1
        let b:multipleCursorsVisualMode = m
        let b:multipleCursorsAppend = a:append
        let b:multipleCursorsSkipEmpty = a:skipEmpty
        " We need to start insert, then spawn cursors otherwise they'll be destroyed
        " using feedkeys() here because :startinsert is being delayed
        call feedkeys('i', 'n')
    endif
endfunction

function! s:vscodeNotifyMultipleCursors()
    if exists('b:notifyMultipleCursors') && b:notifyMultipleCursors
        let b:notifyMultipleCursors = 0
        call VSCodeExtensionNotify('visual-edit', b:multipleCursorsAppend, b:multipleCursorsVisualMode, line("'<"), line("'>"), col("'>"), b:multipleCursorsSkipEmpty)
    endif
endfunction

augroup MultipleCursors
    autocmd!
    autocmd InsertEnter * call <SID>vscodeNotifyMultipleCursors()
augroup END

" Multiple cursors support for visual line/block modes
xnoremap <silent> ma :<C-u>call <SID>vscodePrepareMultipleCursors(1, 1)<CR>
xnoremap <silent> mi :<C-u>call <SID>vscodePrepareMultipleCursors(0, 1)<CR>
xnoremap <silent> mA :<C-u>call <SID>vscodePrepareMultipleCursors(1, 0)<CR>
xnoremap <silent> mI :<C-u>call <SID>vscodePrepareMultipleCursors(0, 0)<CR>
