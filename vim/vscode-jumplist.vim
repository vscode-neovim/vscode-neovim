
" VIM jumplist is used now
nnoremap <silent> <C-o> :<C-u>call VSCodeNotify("workbench.action.navigateBack")<CR>
nnoremap <silent> <C-i> :<C-u>call VSCodeNotify("workbench.action.navigateForward")<CR>
nnoremap <silent> <Tab> :<C-u>call VSCodeNotify("workbench.action.navigateForward")<CR>
