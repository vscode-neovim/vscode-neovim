function! s:toFirstCharOfScreenLine()
    call VSCodeNotify('cursorMove', { 'to': 'wrappedLineFirstNonWhitespaceCharacter' })
endfunction

function! s:toLastCharOfScreenLine()
    call VSCodeNotify('cursorMove', { 'to': 'wrappedLineLastNonWhitespaceCharacter' })
    " Offfset cursor moving to the right caused by calling VSCode command in Vim mode
    call VSCodeNotify('cursorLeft')
endfunction

nnoremap g0 <Cmd>call <SID>toFirstCharOfScreenLine()<CR>
nnoremap g$ <Cmd>call <SID>toLastCharOfScreenLine()<CR>
