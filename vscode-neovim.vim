set shortmess="filnxtToOFI"
set nowrap
set wildchar=9
set mouse=a
set cmdheight=1

function! callVSCode(...)
    call rpcrequest(g:vscode_channel, a:cmd, )
endfunction

function! notifyVSCode(...)
endfunction