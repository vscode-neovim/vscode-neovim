# Change Log

## [0.0.76]

-   Fix mutli-column character handling ( #503 )

## [0.0.75]

-   Improvements to cursor logic ( #501 )
-   Cancel current mode when switching editor ( #156 )

## [0.0.74]

-   Fix cursor logic ( #467 , #488 )
-   Trigger matching word highlight after movement ( #159 )
-   VIM highlight adjustments ( #482 )

## [0.0.73]

-   Improve cursor reveailing logic ( #479 )
-   Hook g0 / g\$ ( #455 )

## [0.0.72]

-   Fix undo regression introduced in `0.0.70`

## [0.0.71]

-   Fix `Unable to determine neovim windows id` error spam ( #418 )

## [0.0.70]

-   Use vscode jumplist actions instead of neovim
-   Fix uppercase marks ( #228 )
-   Various cursor & buffer management fixes ( #404 , #392 , #386 )
-   Implement manageEditorHeight and manageEditorWidth ( #444 )
-   Fix `<C-a>` in insert mode ( #283 )
-   Set vim cwd as vscode workspace ( #429 )
-   Fix shell-agnostic WSL integration ( #147 )
-   Map :x to Wq ( #396 )
-   Various docs contributions
-   Improve build ( #378 )

## [0.0.63]

-   Allow to put text decorations (usually EasyMotion ones) at top setting (`vscode-neovim.textDecorationsAtTop`) ( #358 ), contributed by @jhgarner
-   Fix incorrect `<C-w><C-w>/<C-w>w` mappings ( #359 ), contributed by @tschaei
-   Replace/modernize neovim vscode command line interop mappings by `<Cmd>call` ( #362 ), contributed by @theol0403
-   Fix incorrect `<C-w>gf` mapping ( #365 ), contributed by @Yuuki77
-   Fix applying vim HL (such as `MatchParen`) at end of a line ( #371 )
-   Fix incorrect cursor position when selecting next/prev search result ( #366 )
-   Fix/improve behavior of auto-accepting vim return prompt `Press enter to continue`. In some cases it was excess ( #372 )
-   Bundle extension by webpack ( #377 )

## [0.0.62]

-   Fix jumplist ( #350 )
-   Add `K` and `gO` mappings (mapped to `showHover` and `goToSymbol`) ( #108 ) (@Shatur95)
-   Fix images/icon (@Shatur95)

## [0.0.60/61]

Started from this version `neovim 0.5` nightly version is required
Many things have been refactored/changed internally in this release. So if you see any regression - please fill an issue

-   Turn on VIM smartindenting/autoindenting and remove custom vscode bindings to `o`/`O` (so it uses VIM ones)
-   New buffer,window and cursor management. This makes the extension finally work with git diff view, peek views, search editor views and even in output channels! ( #53 , #187 , #220 , #223, #226)
-   Implement multi-line messages pager. Things like `:registers`, `:changes`, `:jumps`, `:messages` are working correctly now ( #202 , #78 , #296 )
-   Fix tab indent problems and sync vscode tab settings with neovim ( #275 , #239 , #264 , #167 , #100 , #152 , #289 )
-   Fix few macro recording problems ( #207 )
-   Fix ghost keys after exiting insert mode ( #324 ). For `jj` / `jk` users there are still few problems ( #330 ) but they will be sorted in next releases
-   Fix few command line problems ( #155 , #288 )
-   Fix some buffer desync issues ( #312 )
-   Fix `<C-w>v/<C-w>s` split shortcuts ( #331 )
-   Fix brackets for substitute command ( #300 )
-   Add logger and log-related configuration to options
-   Change some default code-actions mappings ( #339 )
-   Add extension icon. Many thanks to https://github.com/ngscheurich

## [0.0.52]

-   Implement dot repeat (`.`) command ( #209 , #173 ). Also fixes `<count>` insert comamnds, like #255 , #249
-   Removed file name from statusbar ( #291 , #230 ), thanks @Shatur95
-   Fix visual selection conversion ( #233 ), thanks @Shatur95
-   Fix wrong string comparsions ( #308 ), thanks @Shatur95
-   Make espace keys work only when editor has focus ( #290 ) , thanks @David-Else
-   Added some file name completion in commandline ( #192 ), thanks @ppwwyyxx
-   Fix missing `<C-w>c` mapping ( #180 ), thanks @trkoch
-   Add operating system dependent path settings ( #137 ), thanks @3nuc
-   bind gh to mousehover ( #107 ), thanks @kwonoj

## [0.0.50]

-   Fix cursor & extension hang for some cases ( #153 )

## [0.0.49]

-   Use command line completion only for command line originated via `:` command ( #146 )

## [0.0.48]

-   Fix incorrect cursor for multibyte single column width characters ( #142 )
-   Fix vim-easymotion decorators drifting when text has multi-byte characters ( #144 )
-   Disabled vim modeline processing
-   Force vim folds to be always opened to prevent problems
-   Fix vim-easymotion decorators drifting to the end of line ( #60 )
-   Fix incorrect cursor positions after commands/mappings such as `>gv` ( #141 )
-   Fix double command prompt ( #120 )

## [0.0.47]

-   Fix the problem when cursor/extension stucks for second+ editor columns ( #126 )

## [0.0.46]

-   Update `neovim-client` to latest version. This should eliminate delay between operations and generally improve the performance. Kudos to @kwonoj for impressive work here
-   Fix cursor movement for 2-byte chars ( #127 )

## [0.0.45]

-   Fix VIM filetype detection ( #115 ). This means `FileType` autocmd should work correctly now. Also fixes `vim-matchup` plugin. This may introduce some side effects from previously disabled filetype plugins - just fill an issue if something doesn't work
-   Fix broken cursor position in insert mode for special keys (such as `del`/`backspace`/etc) if you had recorded a macro in insert mode previously

## [0.0.44]

-   Hotfix broken `VSCodeCallRange` (commenting/formatting didn't work because of this)

## [0.0.43]

-   Visual modes DON'T produce vscode selections right now. These were implemented through various workarounds, gave really small value and were constant origin of headache. Also this fixes few issues related to visual modes ( #105, #118 ). To round the corners, invoking vscode's command palette (by using default vscode hotkeys) from visual mode will convert neovim visual selection to vscode visual selection, this should cover most use cases. Also, there are `VScodeNotifyRange`/`VSCodeCallRange`/`VSCodeNotifyRangePos`/`VSCodeCallRangePos` vim functions if you need to call vscode command with selection. See [this for example](https://github.com/asvetliakov/vscode-neovim/blob/e61832119988bb1e73b81df72956878819426ce2/vim/vscode-code-actions.vim#L42-L54) and [mapping](https://github.com/asvetliakov/vscode-neovim/blob/e61832119988bb1e73b81df72956878819426ce2/vim/vscode-code-actions.vim#L98) if you're doing custom mappings and assuming there is some vscode selection exist. Use `VSCodeNotifyRange` when you don't need a column pos (e.g. for visual line mode) and `VSCodeNotifyRangePos` when you need them (e.g for visual mode).
-   Refactored vscode<->neovim cursor syncrhonization
-   Fix `ma`/`mi` not working when selecting lines upward ( #117 )
-   Changed `ma`/`mi` to skip empty lines. Added `mA`/`mI` for the previous behavior
-   Macro recording fixes
-   Refactored & optimized HL provider (highlight should be faster now)
-   Override default keybindings only when neovim was initialized succesfully ( #112 )
-   Don't preselect `'<,'>` marks when invoking cmdline from visual line ( #111 )
-   Implemented commandline history ( #88 )
-   Add the option to start the visual mode with mouse selection ( #94 )

## [0.0.42]

-   Disabled jj/jk escape keys by default

## [0.0.40]

-   Fix cursor/highlight not working with multi-byte width characters (Russian, Chinese, Japanese, etc...), i.e the extension should work normally with them (#68, #91)
-   Fix incorrect vim highlight when using tab indentation (#81)
-   Removed multiple cursors by default from visual line/block modes (visual block mode still spawns cursors but they are pruly visual) (#59, #61). Previous behavior is still accessible by `mi` or `ma` keybindings while in visual line/block modes
-   Allow to override keys/mappings set by extension (previously they have been set after user config loaded)
-   Allow to identify if neovim is running through vscode extension by checking `if exists('g:vscode')` (#83)
-   Added `<C-[>` and `Escape` as escape keys (#74)
-   Added `<C-n>` and `<C-p>` to select next autocomplete suggestion/show next/prev parameter hint
-   Added `jj` and `jk` as escape keys from the insert mode (#75)
-   Pass `<C-/>` to neovim and call VSCodeCommentary (still recommended to bind it to own keys) (#89)
-   Pass `<S-Tab>` to neovim
-   Allow to pass additional ctrl keys to neovim (see Readme)
-   Added workaround for `gk`/`gj` motions
-   Corrected `gf`/`gF` keybindings. Add `<C-]>` as go-to-def (works in help too) (#77). Add `gd`/`gD` as secondary mappings to go-to-def/peek-def. Add `<C-w>gd` to reveal definition aside

## [0.0.39]

-   Fix bug with incorrect buffer edits
-   Fix cursor jumping after pressing something like `cw` and fast typing text in large file

## [0.0.38]

-   Fix cursor position after deleting a line and possibly other operations

## [0.0.37]

-   Fix performance of o/O. If you're using custom bindings for them, you might need to rebind them to call new action. See vscode-insert.vim

## [0.0.36]

-   Fix macros with insert mode
-   Big performance improvements, fix undo & macros performance
-   Allow to use neovim installed in WSL. Tick useWSL conf checkbox and specify linux path to neovim

## [0.0.35]

-   Use VIM jumplist for `<C-o>`/`<C-i>`/`<Tab>`

## [0.0.33-0.0.34]

-   Fix extension for linux/macos users
-   Fix buffer-vscode desynchornization after redo

## [0.0.32]

-   Cmdline fixes/improvements (#50, #51)

## [0.0.31]

-   Fix crazy cursor jumping when having opened multiple editors panes

## [0.0.30]

-   Implemented nvim's ext_multigrid support. This solves almost all problems with vim highlighting and potentially enables easymotion's overwin motions (they still don't work however). Window management still should be performed by vscode
-   Removed vim-style cursor following on editor scrolling. This totally screwed vscode jumplist, so better to have working jumplist than such minor feature.
-   Cursor position fixes
-   `:e [filepath]` works again

## [0.0.29]

-   Fix selection is being reset in visual mode after typing `vk$` (#48)
-   Fix not cleaning incsearch highlight after canceling the incsearch (#46)
-   Fix incorrect cursor after switching the editor to the same document but in different editor column (#49)

## [0.0.28]

-   Use non-blocking rpc requests when communicatings with vscode for file management operations (closing, opening, etc...). Should eliminate the issue when vim is 'stuck' and doesn't respond anymore
-   Fix incorrect cursor positions after opening `:help something` (#44)
-   Fix visual block selection for single column in multiple rows (#42)
-   Enable VIM syntax highlighting for help files and external buffers like `:PlugStatus`. It's slow and sometimes buggy but better than nothing in meantime

## [0.0.27]

-   Fix incsearch and allow to use `<C-t>`/`<C-g>` with it
-   Reworked/Refactored command line. Now with wildmenu completion support. Also keys like `<C-w>` or `<C-u>` are working fine now in cmdline now

## [0.0.26]

-   Partially revert #41

## [0.0.25]

-   Tab management commands & keys, like `gt` or `tabo[nly]`
-   Window management commands & keys like `sp[lit]`/`vs[plit]` and `<C-w> j/k/l/h` keys
-   Bind scroll commands in neovim instead of vscode extension ([#41](https://github.com/asvetliakov/vscode-neovim/issues/41))

## [0.0.24]

-   File management commands, like `:w` or `:q` (bound to vscode actions)
-   Fix [#40](https://github.com/asvetliakov/vscode-neovim/issues/40)

## [0.0.1-0.0.23]

-   A bunch of development versions. 0.0.23 has the following features
-   Correct editing and the cursor management
-   Control keys in the insert & normal/visual modes
-   Visual mode produces vscode selections
-   Working VIM highlighting (most of a default VIM HL groups are ignored since they don't make sense in VSCode, but non standard groups are processed, so things like vim-easymotion or vim-highlight are working fine)
-   Scrolling commands (scrolling is done by vscode so things are slighly different here)
-   Special vim-easymotion fork to use vscode text decorators instead of replacing text (as original vim-easymotion does)
-   Analogue of vim-commentary (original vim-commentary works fine too)
-   Working external vim buffers, like `:help` or `:PlugStatus`
-   Multiple cursors for visual line/visual block modes

## [0.0.1]

-   Initial release
