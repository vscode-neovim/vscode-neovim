" This file used to force set neovim options which may break the extension. Loaded after user config

set shortmess="filnxtToOFI"
set nowrap
set mouse=a
set cmdheight=1
set wildmode=list

set nobackup
set nowb
set noswapfile
set noautoread
set scrolloff=100
set conceallevel=0

" do not hide buffers
set nohidden
" do not attempt autowrite any buffers
set noautowrite
" Disable shada session storing
" set shada=
" set nonumber
set norelativenumber
" Render line number as "marker" of the visible top/bottom screen row
set number
" up to 10 000 000
set numberwidth=8
" Need to know linebreaks for optimized HL
set listchars+=eol:$
set list
set syntax=off
set signcolumn=no