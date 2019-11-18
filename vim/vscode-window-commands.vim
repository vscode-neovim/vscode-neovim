
function! s:split(...)
    let direction = a:1
    let file = a:2
    call VSCodeCall(direction == 'h' ? 'workbench.action.splitEditorDown' : 'workbench.action.splitEditorRight')
    if file != ''
        call VSCodeExtensionNotify('open-file', expand(file), 'all')
    endif
endfunction

function! s:splitNew(...)
    let file = a:2
    call s:split(a:1, file == '' ? '__vscode_new__' : file)
endfunction

function! s:closeOtherEditors()
    call VSCodeNotify('workbench.action.closeEditorsInOtherGroups')
    call VSCodeNotify('workbench.action.closeOtherEditors')
endfunction

function! s:manageEditorSize(...)
    let count = a:1
    let to = a:2
    for i in range(1, count ? count : 1)
        call VSCodeNotify(to == 'increase' ? 'workbench.action.increaseViewSize' : 'workbench.action.decreaseViewSize')
    endfor
endfunction

command! -nargs=? Split call <SID>split('h', <q-args>)
command! -nargs=? Vsplit call <SID>split('v', <q-args>)
command! -nargs=? New call <SID>split('h', '__vscode_new__')
command! -nargs=? Vnew call <SID>split('v', '__vscode_new__')
command! -bang Only if <q-bang> == '!' | call <SID>closeOtherEditors() | else | call VSCodeNotify('workbench.action.joinAllGroups') | endif

AlterCommand sp[lit] Split
AlterCommand vs[plit] Vsplit
AlterCommand new New
AlterCommand vne[w] Vnew
AlterCommand on[ly] Only

nnoremap <silent> <expr> <C-w>s <SID>split('h')
xnoremap <silent> <expr> <C-w>s <SID>split('h')

nnoremap <silent> <expr> <C-w>v <SID>split('v')
xnoremap <silent> <expr> <C-w>v <SID>split('v')

nnoremap <silent> <expr> <C-w>n <SID>splitNew('h', '__vscode_new__')
xnoremap <silent> <expr> <C-w>n <SID>splitNew('h', '__vscode_new__')

nnoremap <silent> <expr> <C-w>q VSCodeCall('workbench.action.closeActiveEditor')
nnoremap <silent> <expr> <C-w>q VSCodeCall('workbench.action.closeActiveEditor')
xnoremap <silent> <expr> <C-w>c VSCodeCall('workbench.action.closeActiveEditor')
xnoremap <silent> <expr> <C-w>c VSCodeCall('workbench.action.closeActiveEditor')

nnoremap <silent> <expr> <C-w>o VSCodeNotify('workbench.action.joinAllGroups');
xnoremap <silent> <expr> <C-w>o VSCodeNotify('workbench.action.joinAllGroups');

nnoremap <silent> <expr> <C-w>j VSCodeCall('workbench.action.focusBelowGroup')
xnoremap <silent> <expr> <C-w>j VSCodeCall('workbench.action.focusBelowGroup')
nnoremap <silent> <expr> <C-w><C-j> VSCodeNotify('workbench.action.moveEditorToBelowGroup')
xnoremap <silent> <expr> <C-w><C-j> VSCodeNotify('workbench.action.moveEditorToBelowGroup')
nnoremap <silent> <expr> <C-w>k VSCodeCall('workbench.action.focusAboveGroup')
xnoremap <silent> <expr> <C-w>k VSCodeCall('workbench.action.focusAboveGroup')
nnoremap <silent> <expr> <C-w><C-k> VSCodeNotify('workbench.action.moveEditorToAboveGroup')
xnoremap <silent> <expr> <C-w><C-k> VSCodeNotify('workbench.action.moveEditorToAboveGroup')
nnoremap <silent> <expr> <C-w>h VSCodeCall('workbench.action.focusLeftGroup')
xnoremap <silent> <expr> <C-w>h VSCodeCall('workbench.action.focusLeftGroup')
nnoremap <silent> <expr> <C-w><C-h> VSCodeNotify('workbench.action.moveEditorToLeftGroup')
xnoremap <silent> <expr> <C-w><C-h> VSCodeNotify('workbench.action.moveEditorToLeftGroup')
nnoremap <silent> <expr> <C-w>l VSCodeCall('workbench.action.focusRightGroup')
xnoremap <silent> <expr> <C-w>l VSCodeCall('workbench.action.focusRightGroup')
nnoremap <silent> <expr> <C-w><C-l> VSCodeNotify('workbench.action.moveEditorToRightGroup')
xnoremap <silent> <expr> <C-w><C-l> VSCodeNotify('workbench.action.moveEditorToRightGroup')
nnoremap <silent> <expr> <C-w>w VSCodeCall('workbench.action.focusNextGroup')
nnoremap <silent> <expr> <C-w>w VSCodeCall('workbench.action.focusNextGroup')
xnoremap <silent> <expr> <C-w><C-w> VSCodeCall('workbench.action.focusNextGroup')
xnoremap <silent> <expr> <C-w><C-w> VSCodeCall('workbench.action.focusNextGroup')
nnoremap <silent> <expr> <C-w>W VSCodeCall('workbench.action.focusPreviousGroup')
xnoremap <silent> <expr> <C-w>W VSCodeCall('workbench.action.focusPreviousGroup')
nnoremap <silent> <expr> <C-w>p VSCodeCall('workbench.action.focusPreviousGroup')
xnoremap <silent> <expr> <C-w>p VSCodeCall('workbench.action.focusPreviousGroup')
nnoremap <silent> <expr> <C-w>t VSCodeCall('workbench.action.focusFirstEditorGroup')
xnoremap <silent> <expr> <C-w>t VSCodeCall('workbench.action.focusFirstEditorGroup')
nnoremap <silent> <expr> <C-w>b VSCodeCall('workbench.action.focusLastEditorGroup')
xnoremap <silent> <expr> <C-w>b VSCodeCall('workbench.action.focusLastEditorGroup')

nnoremap <silent> <expr> <C-w>= VSCodeNotify('workbench.action.evenEditorWidths')
xnoremap <silent> <expr> <C-w>= VSCodeNotify('workbench.action.evenEditorWidths')

nnoremap <silent> <C-w>> :<C-u> call <SID>manageEditorSize(v:count, 'increase')<CR>
xnoremap <silent> <C-w>> :<C-u> call <SID>manageEditorSize(v:count, 'increase')<CR>
nnoremap <silent> <C-w>+ :<C-u> call <SID>manageEditorSize(v:count, 'increase')<CR>
xnoremap <silent> <C-w>+ :<C-u> call <SID>manageEditorSize(v:count, 'increase')<CR>
nnoremap <silent> <C-w>< :<C-u> call <SID>manageEditorSize(v:count, 'decrease')<CR>
xnoremap <silent> <C-w>< :<C-u> call <SID>manageEditorSize(v:count, 'decrease')<CR>
nnoremap <silent> <C-w>- :<C-u> call <SID>manageEditorSize(v:count, 'decrease')<CR>
xnoremap <silent> <C-w>- :<C-u> call <SID>manageEditorSize(v:count, 'decrease')<CR>

nnoremap <silent> <expr> <C-w>_ VSCodeNotify('workbench.action.toggleEditorWidths')

nnoremap <C-w>H :<C-u>echoerr 'Not supported yet'<CR>
xnoremap <C-w>H :<C-u>echoerr 'Not supported yet'<CR>
nnoremap <C-w>L :<C-u>echoerr 'Not supported yet'<CR>
xnoremap <C-w>L :<C-u>echoerr 'Not supported yet'<CR>
nnoremap <C-w>K :<C-u>echoerr 'Not supported yet'<CR>
xnoremap <C-w>K :<C-u>echoerr 'Not supported yet'<CR>
nnoremap <C-w>J :<C-u>echoerr 'Not supported yet'<CR>
xnoremap <C-w>J :<C-u>echoerr 'Not supported yet'<CR>
