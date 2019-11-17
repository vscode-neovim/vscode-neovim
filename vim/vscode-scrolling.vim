
function! s:vscodeReveal(at, resetCursor)
    call VSCodeExtensionNotify('reveal', a:at, a:resetCursor)
endfunction

nnoremap <silent> <expr> z<CR> <SID>vscodeReveal("top", 1)
xnoremap <silent> <expr> z<CR> <SID>vscodeReveal("top", 1)
nnoremap <silent> <expr> zt <SID>vscodeReveal("top", 0)
xnoremap <silent> <expr> zt <SID>vscodeReveal("top", 0)
nnoremap <silent> <expr> z. <SID>vscodeReveal("center", 1)
xnoremap <silent> <expr> z. <SID>vscodeReveal("center", 1)
nnoremap <silent> <expr> zz <SID>vscodeReveal("center", 0)
xnoremap <silent> <expr> zz <SID>vscodeReveal("center", 0)
nnoremap <silent> <expr> z- <SID>vscodeReveal("bottom", 1)
xnoremap <silent> <expr> z- <SID>vscodeReveal("bottom", 1)
nnoremap <silent> <expr> zb <SID>vscodeReveal("bottom", 0)
xnoremap <silent> <expr> zb <SID>vscodeReveal("bottom", 0)
