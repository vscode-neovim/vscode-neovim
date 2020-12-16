function s:reveal(direction, resetCursor)
    call VSCodeExtensionNotify('reveal', a:direction, a:resetCursor)
endfunction

nnoremap z<CR> <Cmd>call <SID>reveal('top', 1)<CR>
xnoremap z<CR> <Cmd>call <SID>reveal('top', 1)<CR>
nnoremap zt <Cmd>call <SID>reveal('top', 0)<CR>
xnoremap zt <Cmd>call <SID>reveal('top', 0)<CR>
nnoremap z. <Cmd>call <SID>reveal('center', 1)<CR>
xnoremap z. <Cmd>call <SID>reveal('center', 1)<CR>
nnoremap zz <Cmd>call <SID>reveal('center', 0)<CR>
xnoremap zz <Cmd>call <SID>reveal('center', 0)<CR>
nnoremap z- <Cmd>call <SID>reveal('bottom', 1)<CR>
xnoremap z- <Cmd>call <SID>reveal('bottom', 1)<CR>
nnoremap zb <Cmd>call <SID>reveal('bottom', 0)<CR>
xnoremap zb <Cmd>call <SID>reveal('bottom', 0)<CR>


function s:moveCursor(to)
    " Native VSCode commands don't register jumplist. Fix by registering jumplist in Vim e.g. for subsequent use of <C-o>
    normal! m'
    call VSCodeExtensionNotify('move-cursor', a:to)
endfunction

nnoremap H <Cmd>call <SID>moveCursor('top')<CR>
xnoremap H <Cmd>call <SID>moveCursor('top')<CR>
nnoremap M <Cmd>call <SID>moveCursor('middle')<CR>
xnoremap M <Cmd>call <SID>moveCursor('middle')<CR>
nnoremap L <Cmd>call <SID>moveCursor('bottom')<CR>
xnoremap L <Cmd>call <SID>moveCursor('bottom')<CR>

" Disabled due to scroll problems (the ext binds them directly)
" nnoremap <silent> <expr> <C-d> VSCodeExtensionCall('scroll', 'halfPage', 'down')
" xnoremap <silent> <expr> <C-d> VSCodeExtensionCall('scroll', 'halfPage', 'down')
" nnoremap <silent> <expr> <C-u> VSCodeExtensionCall('scroll', 'halfPage', 'up')
" xnoremap <silent> <expr> <C-u> VSCodeExtensionCall('scroll', 'halfPage', 'up')

" nnoremap <silent> <expr> <C-f> VSCodeExtensionCall('scroll', 'page', 'down')
" xnoremap <silent> <expr> <C-f> VSCodeExtensionCall('scroll', 'page', 'down')
" nnoremap <silent> <expr> <C-b> VSCodeExtensionCall('scroll', 'page', 'up')
" xnoremap <silent> <expr> <C-b> VSCodeExtensionCall('scroll', 'page', 'up')

" nnoremap <silent> <expr> <C-e> VSCodeExtensionNotify('scroll-line', 'down')
" xnoremap <silent> <expr> <C-e> VSCodeExtensionNotify('scroll-line', 'down')
" nnoremap <silent> <expr> <C-y> VSCodeExtensionNotify('scroll-line', 'up')
" xnoremap <silent> <expr> <C-y> VSCodeExtensionNotify('scroll-line', 'up')
