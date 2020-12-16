function! s:toLastCharOfScreenLine()
    call VSCodeNotify('cursorEnd')
    " Optmized delay is required after calling VSCode command
    sleep 85m
    " Offset cursor moving to the right by 1 column caused by calling `VSCodeNotify('cursorEnd')` in Vim mode
    normal! h
endfunction

nnoremap g0 <Cmd>call VSCodeNotify('cursorHome')<CR>
nnoremap g$ <Cmd>call <SID>toLastCharOfScreenLine()<CR>
