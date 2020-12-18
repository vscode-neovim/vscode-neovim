function! s:toFirstCharOfScreenLine()
    call VSCodeExtensionNotify('cursor-move', 'wrappedLineFirstNonWhitespaceCharacter')
endfunction

function! s:toLastCharOfScreenLine()
    call VSCodeExtensionNotify('cursor-move', 'wrappedLineLastNonWhitespaceCharacter')
    " Offfset cursor moving to the right caused by calling VSCode command in Vim mode
    call VSCodeNotify('cursorLeft')
endfunction

nnoremap g0 <Cmd>call <SID>toFirstCharOfScreenLine()<CR>
nnoremap g$ <Cmd>call <SID>toLastCharOfScreenLine()<CR>
