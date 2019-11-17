call altercmd#define('full', 'F-U-L-L')
call altercmd#define('ab[br]', 'A-B-B-R')

function! RecordTheCurrentCommandLine()
  let g:cmdline = getcmdline()
  return ''
endfunction
cnoremap <expr> {X}  RecordTheCurrentCommandLine()

function! Test(lhs, rhs)
  let g:cmdline = ''
  silent execute 'normal' ":".a:lhs."\<C-]>{X}\<C-c>"
  Expect g:cmdline ==# a:rhs
endfunction

describe 'altercmd#define'
  it 'replaces a built-in command'
    call Test('full', 'F-U-L-L')
  end

  it 'replaces all abbreviated names of a built-in command'
    call Test('ab', 'A-B-B-R')
    call Test('abb', 'A-B-B-R')
    call Test('abbr', 'A-B-B-R')
  end

  it 'supports <buffer>'
    silent edit 'test-A'
    call altercmd#define('<buffer>', 'ctx', 'Axe')
    silent edit 'test-B'
    call altercmd#define('<buffer>', 'ctx', 'Bow')
    silent edit 'test-C'
    call altercmd#define('<buffer>', 'ctx', 'Club')

    silent edit 'test-A'
    call Test('full', 'F-U-L-L')
    call Test('ctx', 'Axe')
    silent edit 'test-B'
    call Test('full', 'F-U-L-L')
    call Test('ctx', 'Bow')
    silent edit 'test-C'
    call Test('full', 'F-U-L-L')
    call Test('ctx', 'Club')
  end
end
