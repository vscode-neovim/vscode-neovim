
function! s:split(...) abort
    let direction = a:1
    let file = exists('a:2') ? a:2 : ''
    call VSCodeCall(direction ==# 'h' ? 'workbench.action.splitEditorDown' : 'workbench.action.splitEditorRight')
    if file != ''
        call VSCodeExtensionNotify('open-file', expand(file), 'all')
    endif
endfunction

function! s:splitNew(...)
    let file = a:2
    call s:split(a:1, empty(file) ? '__vscode_new__' : file)
endfunction

function! s:closeOtherEditors()
    call VSCodeNotify('workbench.action.closeEditorsInOtherGroups')
    call VSCodeNotify('workbench.action.closeOtherEditors')
endfunction

function! s:manageEditorSize(...)
    let count = a:1
    let to = a:2
    for i in range(1, count ? count : 1)
        call VSCodeNotify(to ==# 'increase' ? 'workbench.action.increaseViewSize' : 'workbench.action.decreaseViewSize')
    endfor
endfunction

command! -complete=file -nargs=? Split call <SID>split('h', <q-args>)
command! -complete=file -nargs=? Vsplit call <SID>split('v', <q-args>)
command! -complete=file -nargs=? New call <SID>split('h', '__vscode_new__')
command! -complete=file -nargs=? Vnew call <SID>split('v', '__vscode_new__')
command! -bang Only if <q-bang> ==# '!' | call <SID>closeOtherEditors() | else | call VSCodeNotify('workbench.action.joinAllGroups') | endif

AlterCommand sp[lit] Split
AlterCommand vs[plit] Vsplit
AlterCommand new New
AlterCommand vne[w] Vnew
AlterCommand on[ly] Only

nnoremap <silent> <C-w>s <Cmd>call <SID>split('h')<CR>
xnoremap <silent> <C-w>s <Cmd>call <SID>split('h')<CR>

nnoremap <silent> <C-w>v <Cmd>call <SID>split('v')<CR>
xnoremap <silent> <C-w>v <Cmd>call <SID>split('v')<CR>

nnoremap <silent> <C-w>n <Cmd>call <SID>splitNew('h', '__vscode_new__')<CR>
xnoremap <silent> <C-w>n <Cmd>call <SID>splitNew('h', '__vscode_new__')<CR>

nnoremap <silent> <C-w>q <Cmd>call VSCodeNotify('workbench.action.closeActiveEditor')<CR>
xnoremap <silent> <C-w>q <Cmd>call VSCodeNotify('workbench.action.closeActiveEditor')<CR>
nnoremap <silent> <C-w>c <Cmd>call VSCodeNotify('workbench.action.closeActiveEditor')<CR>
xnoremap <silent> <C-w>c <Cmd>call VSCodeNotify('workbench.action.closeActiveEditor')<CR>

nnoremap <silent> <C-w>o <Cmd>call VSCodeNotify('workbench.action.joinAllGroups')<CR>
xnoremap <silent> <C-w>o <Cmd>call VSCodeNotify('workbench.action.joinAllGroups')<CR>

nnoremap <silent> <C-w>j <Cmd>call VSCodeNotify('workbench.action.focusBelowGroup')<CR>
xnoremap <silent> <C-w>j <Cmd>call VSCodeNotify('workbench.action.focusBelowGroup')<CR>
nnoremap <silent> <C-w><C-j> <Cmd>call VSCodeNotify('workbench.action.moveEditorToBelowGroup')<CR>
xnoremap <silent> <C-w><C-j> <Cmd>call VSCodeNotify('workbench.action.moveEditorToBelowGroup')<CR>
nnoremap <silent> <C-w>k <Cmd>call VSCodeNotify('workbench.action.focusAboveGroup')<CR>
xnoremap <silent> <C-w>k <Cmd>call VSCodeNotify('workbench.action.focusAboveGroup')<CR>
nnoremap <silent> <C-w><C-i> <Cmd>call VSCodeNotify('workbench.action.moveEditorToAboveGroup')<CR>
xnoremap <silent> <C-w><C-i> <Cmd>call VSCodeNotify('workbench.action.moveEditorToAboveGroup')<CR>
nnoremap <silent> <C-w>h <Cmd>call VSCodeNotify('workbench.action.focusLeftGroup')<CR>
xnoremap <silent> <C-w>h <Cmd>call VSCodeNotify('workbench.action.focusLeftGroup')<CR>
nnoremap <silent> <C-w><C-h> <Cmd>call VSCodeNotify('workbench.action.moveEditorToLeftGroup')<CR>
xnoremap <silent> <C-w><C-h> <Cmd>call VSCodeNotify('workbench.action.moveEditorToLeftGroup')<CR>
nnoremap <silent> <C-w>l <Cmd>call VSCodeNotify('workbench.action.focusRightGroup')<CR>
xnoremap <silent> <C-w>l <Cmd>call VSCodeNotify('workbench.action.focusRightGroup')<CR>
nnoremap <silent> <C-w><C-l> <Cmd>call VSCodeNotify('workbench.action.moveEditorToRightGroup')<CR>
xnoremap <silent> <C-w><C-l> <Cmd>call VSCodeNotify('workbench.action.moveEditorToRightGroup')<CR>
nnoremap <silent> <C-w>w <Cmd>call VSCodeNotify('workbench.action.focusNextGroup')<CR>
xnoremap <silent> <C-w>w <Cmd>call VSCodeNotify('workbench.action.focusNextGroup')<CR>
nnoremap <silent> <C-w><C-w> <Cmd>call VSCodeNotify('workbench.action.focusNextGroup')<CR>
xnoremap <silent> <C-w><C-w> <Cmd>call VSCodeNotify('workbench.action.focusNextGroup')<CR>
nnoremap <silent> <C-w>W <Cmd>call VSCodeNotify('workbench.action.focusPreviousGroup')<CR>
xnoremap <silent> <C-w>W <Cmd>call VSCodeNotify('workbench.action.focusPreviousGroup')<CR>
nnoremap <silent> <C-w>p <Cmd>call VSCodeNotify('workbench.action.focusPreviousGroup')<CR>
xnoremap <silent> <C-w>p <Cmd>call VSCodeNotify('workbench.action.focusPreviousGroup')<CR>
nnoremap <silent> <C-w>t <Cmd>call VSCodeNotify('workbench.action.focusFirstEditorGroup')<CR>
xnoremap <silent> <C-w>t <Cmd>call VSCodeNotify('workbench.action.focusFirstEditorGroup')<CR>
nnoremap <silent> <C-w>b <Cmd>call VSCodeNotify('workbench.action.focusLastEditorGroup')<CR>
xnoremap <silent> <C-w>b <Cmd>call VSCodeNotify('workbench.action.focusLastEditorGroup')<CR>

nnoremap <silent> <C-w>= <Cmd>call VSCodeNotify('workbench.action.evenEditorWidths')<CR>
xnoremap <silent> <C-w>= <Cmd>call VSCodeNotify('workbench.action.evenEditorWidths')<CR>

nnoremap <silent> <C-w>> <Cmd>call <SID>manageEditorSize(v:count, 'increase')<CR>
xnoremap <silent> <C-w>> <Cmd>call <SID>manageEditorSize(v:count, 'increase')<CR>
nnoremap <silent> <C-w>+ <Cmd>call <SID>manageEditorSize(v:count, 'increase')<CR>
xnoremap <silent> <C-w>+ <Cmd>call <SID>manageEditorSize(v:count, 'increase')<CR>
nnoremap <silent> <C-w>< <Cmd>call <SID>manageEditorSize(v:count, 'decrease')<CR>
xnoremap <silent> <C-w>< <Cmd>call <SID>manageEditorSize(v:count, 'decrease')<CR>
nnoremap <silent> <C-w>- <Cmd>call <SID>manageEditorSize(v:count, 'decrease')<CR>
xnoremap <silent> <C-w>- <Cmd>call <SID>manageEditorSize(v:count, 'decrease')<CR>

nnoremap <silent> <C-w>_ <Cmd>call VSCodeNotify('workbench.action.toggleEditorWidths')<CR>

nnoremap <C-w>H <Cmd>echoerr 'Not supported yet'<CR>
xnoremap <C-w>H <Cmd>echoerr 'Not supported yet'<CR>
nnoremap <C-w>L <Cmd>echoerr 'Not supported yet'<CR>
xnoremap <C-w>L <Cmd>echoerr 'Not supported yet'<CR>
nnoremap <C-w>K <Cmd>echoerr 'Not supported yet'<CR>
xnoremap <C-w>K <Cmd>echoerr 'Not supported yet'<CR>
nnoremap <C-w>J <Cmd>echoerr 'Not supported yet'<CR>
xnoremap <C-w>J <Cmd>echoerr 'Not supported yet'<CR>
