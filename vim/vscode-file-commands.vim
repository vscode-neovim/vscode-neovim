
function! s:editOrNew(...)
    let file = a:1
    let bang = a:2

    if file == ''
        if bang == '!'
            call VSCodeCall('workbench.action.files.openFile')
        else
            call VSCodeCall('workbench.action.quickOpen')
        endif
    else
        " Last arg is to close previous file, e.g. e! ~/blah.txt will open blah.txt instead the current file
        call VSCodeExtensionNotify('open-file', expand(file), bang == '!' ? 1 : 0)
    endif
endfunction

function! s:saveAndClose()
    call VSCodeCall('workbench.action.files.save')
    call VSCodeCall('workbench.action.closeActiveEditor')
endfunction

function! s:saveAllAndClose()
    call VSCodeCall('workbench.action.files.saveAll')
    call VSCodeCall('workbench.action.closeAllEditors')
endfunction

" command! -bang -nargs=? Edit call VSCodeCall('workbench.action.quickOpen')
command! -bang -nargs=? Edit call <SID>editOrNew(<q-args>, <q-bang>)
command! -bang -nargs=? Ex call <SID>editOrNew(<q-args>, <q-bang>)
command! -bang Enew call <SID>editOrNew('__vscode_new__', <q-bang>)
command! -bang Find call VSCodeCall('workbench.action.quickOpen')

command! -bang Write if <q-bang> == '!' | call VSCodeCall('workbench.action.files.saveAs') | else | call VSCodeCall('workbench.action.files.save') | endif
command! -bang Saveas call VSCodeCall('workbench.action.files.saveAs')

command! -bang Wall call VSCodeCall('workbench.action.files.saveAll')
command! -bang Quit if <q-bang> == '!' | call VSCodeCall('workbench.action.revertAndCloseActiveEditor') | else | call VSCodeCall('workbench.action.closeActiveEditor') | endif

command! -bang Wq call <SID>saveAndClose()

command! -bang Qall call VSCodeCall('workbench.action.closeAllEditors')

command! -bang Wqall call <SID>saveAllAndClose()
command! -bang Xall call <SID>saveAllAndClose()

AlterCommand e[dit] Edit
AlterCommand ex Ex
AlterCommand ene[w] Enew
AlterCommand fin[d] Find
AlterCommand w[rite] Write
AlterCommand sav[eas] Saveas
AlterCommand wa[ll] Wall
AlterCommand q[uit] Quit
AlterCommand wq Wq
AlterCommand qa[ll] Qall
AlterCommand wqa[ll] Wqall
AlterCommand xa[ll] Xall

nnoremap <silent> ZZ :Wq<CR>
nnoremap <silent> ZQ :Quit!<CR>
