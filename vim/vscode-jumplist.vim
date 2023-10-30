function! s:jump(...)
    let count = a:1
    let to = a:2

    for i in range(1, count ? count : 1)
        call VSCodeNotify(to ==# 'back' ? 'workbench.action.navigateBack' : 'workbench.action.navigateForward')
    endfor
endfunction

nnoremap <silent> <C-o> <Cmd>call <SID>jump(v:count, 'back')<CR>
nnoremap <silent> <C-t> <Cmd>call <SID>jump(v:count, 'back')<CR>
nnoremap <silent> <C-i> <Cmd>call <SID>jump(v:count, 'forward')<CR>
nnoremap <silent> <Tab> <Cmd>call <SID>jump(v:count, 'forward')<CR>
