
" Override jumplist to vscode jumplist for now
nnoremap <silent> <expr> <C-o> VSCodeCall("workbench.action.navigateBack")
nnoremap <silent> <expr> <C-i> VSCodeCall("workbench.action.navigateForward")
nnoremap <silent> <expr> <Tab> VSCodeCall("workbench.action.navigateForward")
