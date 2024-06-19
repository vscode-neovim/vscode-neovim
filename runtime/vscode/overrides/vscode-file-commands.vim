
function! s:editOrNew(...)
    let file = a:1
    let bang = a:2

    if empty(file)
        if bang ==# '!'
            call VSCodeNotify('workbench.action.files.revert')
        else
            call VSCodeNotify('workbench.action.quickOpen')
        endif
    else
        " Last arg is to close previous file, e.g. e! ~/blah.txt will open blah.txt instead the current file
        call VSCodeExtensionNotify('open-file', expand(file), bang ==# '!' ? 1 : 0)
    endif
endfunction

function! s:saveAndClose() abort
    call VSCodeCall('workbench.action.files.save')
    call VSCodeNotify('workbench.action.closeActiveEditor')
endfunction

function! s:saveAllAndClose() abort
    call VSCodeCall('workbench.action.files.saveAll')
    call VSCodeNotify('workbench.action.closeAllEditors')
endfunction

" command! -bang -nargs=? Edit call VSCodeCall('workbench.action.quickOpen')
command! -complete=file -bang -nargs=? Edit call <SID>editOrNew(<q-args>, <q-bang>)
command! -bang -nargs=? Ex call <SID>editOrNew(<q-args>, <q-bang>)
command! -bang Enew call <SID>editOrNew('__vscode_new__', <q-bang>)
command! -bang Find call VSCodeNotify('workbench.action.quickOpen')

command! -bang Quit if <q-bang> ==# '!' | call VSCodeNotify('workbench.action.revertAndCloseActiveEditor') | else | call VSCodeNotify('workbench.action.closeActiveEditor') | endif

command! -bang Wq call <SID>saveAndClose()
command! -bang Xit call <SID>saveAndClose()

command! -bang Qall call VSCodeNotify('workbench.action.closeAllEditors')

command! -bang Wqall call <SID>saveAllAndClose()
command! -bang Xall call <SID>saveAllAndClose()

AlterCommand e[dit] Edit
AlterCommand ex Ex
AlterCommand ene[w] Enew
AlterCommand fin[d] Find
AlterCommand q[uit] Quit
AlterCommand wq Wq
AlterCommand x[it] Xit
AlterCommand qa[ll] Qall
AlterCommand wqa[ll] Wqall
AlterCommand xa[ll] Xall

nnoremap ZZ <Cmd>Wq<CR>
nnoremap ZQ <Cmd>Quit!<CR>
