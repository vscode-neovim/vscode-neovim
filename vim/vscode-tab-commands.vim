function! s:switchEditor(...) abort
    let count = a:1
    let direction = a:2
    for i in range(1, count ? count : 1)
        call VSCodeCall(direction ==# 'next' ? 'workbench.action.nextEditorInGroup' : 'workbench.action.previousEditorInGroup')
    endfor
endfunction

command! -complete=file -nargs=? Tabedit if empty(<q-args>) | call VSCodeNotify('workbench.action.quickOpen') | else | call VSCodeExtensionNotify('open-file', expand(<q-args>), 0) | endif
command! -complete=file -nargs=? Tabnew call VSCodeExtensionNotify('open-file', '__vscode_new__', 0)
command! Tabfind call VSCodeNotify('workbench.action.quickOpen')
command! Tab echoerr 'Not supported'
command! Tabs echoerr 'Not supported'
command! -bang Tabclose if <q-bang> ==# '!' | call VSCodeNotify('workbench.action.revertAndCloseActiveEditor') | else | call VSCodeNotify('workbench.action.closeActiveEditor') | endif
command! Tabonly call VSCodeNotify('workbench.action.closeOtherEditors')
command! -nargs=? Tabnext call <SID>switchEditor(<q-args>, 'next')
command! -nargs=? Tabprevious call <SID>switchEditor(<q-args>, 'prev')
command! Tabfirst call VSCodeNotify('workbench.action.firstEditorInGroup')
command! Tablast call VSCodeNotify('workbench.action.lastEditorInGroup')
command! Tabrewind call VSCodeNotify('workbench.action.firstEditorInGroup')
command! -nargs=? Tabmove echoerr 'Not supported yet'

AlterCommand tabe[dit] Tabedit
AlterCommand tabnew Tabnew
AlterCommand tabf[ind] Tabfind
AlterCommand tab Tab
AlterCommand tabs Tabs
AlterCommand tabc[lose] Tabclose
AlterCommand tabo[nly] Tabonly
AlterCommand tabn[ext] Tabnext
AlterCommand tabp[revious] Tabprevious
AlterCommand tabr[ewind] Tabrewind
AlterCommand tabfir[st] Tabfirst
AlterCommand tabl[ast] Tablast
AlterCommand tabm[ove] Tabmove

nnoremap gt <Cmd>call <SID>switchEditor(v:count, 'next')<CR>
xnoremap gt <Cmd>call <SID>switchEditor(v:count, 'next')<CR>
nnoremap gT <Cmd>call <SID>switchEditor(v:count, 'prev')<CR>
xnoremap gT <Cmd>call <SID>switchEditor(v:count, 'prev')<CR>
