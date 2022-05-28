" This file used to force set neovim options which may break the extension. Loaded after user config

scriptencoding utf-8

set shortmess=filnxtToOFI
set nowrap
set mouse=a
set cmdheight=1
set wildmode=list
set wildchar=<C-e>

set nobackup
set nowb
set noswapfile
set noautoread
set scrolloff=100
set conceallevel=0
set nocursorline

" do not hide buffers
" set nohidden
set hidden
set bufhidden=hide
" do not attempt autowrite any buffers
set noautowrite
" Disable shada session storing
" set shada=
" set nonumber
set norelativenumber
" Render line number as "marker" of the visible top/bottom screen row
set nonumber
" up to 10 000 000
" set numberwidth=8
" Need to know tabs for HL
set listchars=tab:❥♥
set list
" Allow to use vim HL for external buffers, vscode buffers explicitly disable it
syntax on
set signcolumn=no

" Disable statusline and ruler since we don't need them anyway
set statusline=
set laststatus=0
set noruler

" Disable modeline processing. It's being used for tab related settings usually and we don't want to override ours
set nomodeline
set modelines=0

" Turn off auto-folding
set nofoldenable
set foldcolumn=0
set foldmethod=manual

" Turn on auto-indenting
set autoindent
set smartindent

" split/nosplit doesn't work currently, see https://github.com/asvetliakov/vscode-neovim/issues/329
set inccommand=

" lazyredraw breaks the movement
set nolazyredraw

function s:forceLocalOptions()
    setlocal nowrap
    setlocal conceallevel=0
    setlocal scrolloff=100
    setlocal hidden
    setlocal bufhidden=hide
    setlocal noautowrite
    setlocal nonumber
    setlocal norelativenumber
    setlocal list
    setlocal listchars=tab:❥♥
    if exists('b:vscode_controlled') && b:vscode_controlled
        setlocal syntax=off
    endif
    setlocal nofoldenable
    setlocal foldcolumn=0
    setlocal foldmethod=manual
    setlocal nolazyredraw
endfunction

augroup VscodeForceOptions
    autocmd!
    autocmd BufEnter,FileType * call <SID>forceLocalOptions()
augroup END
