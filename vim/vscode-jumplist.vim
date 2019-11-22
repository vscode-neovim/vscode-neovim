
" Override jumplist to vscode jumplist for now
nnoremap <silent> <expr> <C-o> VSCodeNotify("workbench.action.navigateBack")
nnoremap <silent> <expr> <C-i> VSCodeNotify("workbench.action.navigateForward")
nnoremap <silent> <expr> <Tab> VSCodeNotify("workbench.action.navigateForward")
