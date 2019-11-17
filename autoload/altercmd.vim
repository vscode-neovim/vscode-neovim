" altercmd - Alter built-in Ex commands by your own ones
" Version: 0.0.1
" Copyright (C) 2009-2015 Kana Natsuno <http://whileimautomaton.net/>
" License: MIT license  {{{
"     Permission is hereby granted, free of charge, to any person obtaining
"     a copy of this software and associated documentation files (the
"     "Software"), to deal in the Software without restriction, including
"     without limitation the rights to use, copy, modify, merge, publish,
"     distribute, sublicense, and/or sell copies of the Software, and to
"     permit persons to whom the Software is furnished to do so, subject to
"     the following conditions:
"
"     The above copyright notice and this permission notice shall be included
"     in all copies or substantial portions of the Software.
"
"     THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
"     OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
"     MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
"     IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
"     CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
"     TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
"     SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
" }}}
" Interface  "{{{1
function! altercmd#define(...)  "{{{2
  let [buffer, original_name, alternate_name]
  \ = (a:000[0] ==? '<buffer>' ? [] : ['']) + a:000

  if original_name =~ '\['
    let [original_name_head, original_name_tail] = split(original_name, '[')
    let original_name_tail = substitute(original_name_tail, '\]', '', '')
  else
    let original_name_head = original_name
    let original_name_tail = ''
  endif

  let original_name_tail = ' ' . original_name_tail
  for i in range(len(original_name_tail))
    let lhs = original_name_head . original_name_tail[1:i]
    execute 'cnoreabbrev <expr>' buffer lhs
    \ '(getcmdtype() == ":" && getcmdline() ==# "' . lhs  . '")'
    \ '?' ('"' . alternate_name . '"')
    \ ':' ('"' . lhs . '"')
  endfor
endfunction




function! altercmd#load()  "{{{2
  runtime plugin/altercmd.vim
endfunction








" __END__  "{{{1
" vim: foldmethod=marker
