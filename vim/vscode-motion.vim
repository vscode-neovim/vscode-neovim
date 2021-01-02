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

" Note: Using these in macro will break it
nnoremap gk <Cmd>call VSCodeNotify('cursorMove', { 'to': 'up', 'by': 'wrappedLine', 'value': v:count ? v:count : 1 })<CR>
nnoremap gj <Cmd>call VSCodeNotify('cursorMove', { 'to': 'down', 'by': 'wrappedLine', 'value': v:count ? v:count : 1 })<CR>
