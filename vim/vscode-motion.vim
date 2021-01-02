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


nnoremap gk <Cmd>call VSCodeNotify('cursorMove', { 'to': 'up', 'by': 'wrappedLine', 'value': v:count ? v:count : 1 })<CR>
nnoremap gj <Cmd>call VSCodeNotify('cursorMove', { 'to': 'down', 'by': 'wrappedLine', 'value': v:count ? v:count : 1 })<CR>

nnoremap j <Cmd>call VSCodeNotify('cursorMove', { 'to': 'down', 'by': 'line', 'value': v:count ? v:count : 1 })<CR>
nnoremap k <Cmd>call VSCodeNotify('cursorMove', { 'to': 'up', 'by': 'line', 'value': v:count ? v:count : 1 })<CR>