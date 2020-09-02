
function! s:vscodeInsertBefore()
    call VSCodeExtensionCall('insert-line', 'before')
    startinsert
endfunction

function! s:vscodeInsertAfter()
    call VSCodeExtensionCall('insert-line', 'after')
    startinsert
endfunction

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
        call VSCodeExtensionNotify('visual-edit', b:multipleCursorsAppend, b:multipleCursorsVisualMode, line("'<"), line("'>"), b:multipleCursorsSkipEmpty)
    endif
endfunction

augroup MultipleCursors
    autocmd!
    autocmd InsertEnter * call <SID>vscodeNotifyMultipleCursors()
augroup END

nnoremap <silent> O :<C-u> call<SID>vscodeInsertBefore()<CR>
nnoremap <silent> o :<C-u> call<SID>vscodeInsertAfter()<CR>

" For calling original vim o/O, used for dot-repeat
nnoremap <silent> mO O
nnoremap <silent> mo o

" Multiple cursors support for visual line/block modes
xnoremap <silent> ma :<C-u>call <SID>vscodePrepareMultipleCursors(1, 1)<CR>
xnoremap <silent> mi :<C-u>call <SID>vscodePrepareMultipleCursors(0, 1)<CR>
xnoremap <silent> mA :<C-u>call <SID>vscodePrepareMultipleCursors(1, 0)<CR>
xnoremap <silent> mI :<C-u>call <SID>vscodePrepareMultipleCursors(0, 0)<CR>
