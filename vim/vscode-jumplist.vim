
" VIM jumplist is used now
" nnoremap <silent> <C-o> :<C-u>call VSCodeNotify("workbench.action.navigateBack")<CR>
" nnoremap <silent> <C-i> :<C-u>call VSCodeNotify("workbench.action.navigateForward")<CR>
" nnoremap <silent> <Tab> :<C-u>call VSCodeNotify("workbench.action.navigateForward")<CR>

function s:jump(forward)
    let g:isJumping = 1
    exe a:forward ? "normal! 1\<C-i>" : "normal! \<C-o>"
    let g:isJumping = 0
endfunction

nnoremap <silent> <C-o> :<C-u>call <SID>jump(0)<CR>
nnoremap <silent> <C-i> :<C-u>call <SID>jump(1)<CR>
nnoremap <silent> <Tab> :<C-u>call <SID>jump(1)<CR>

