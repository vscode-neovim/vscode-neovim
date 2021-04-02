<h2 align="center"><img src="./images/icon.png" height="128"><br>VSCode Neovim</h2>
<p align="center"><strong>VSCode Neovim Integration</strong></p>

<p align=center>
<a href="https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim"><img src="https://vsmarketplacebadge.apphb.com/version/asvetliakov.vscode-neovim.svg"></a>
<a href="https://github.com/asvetliakov/vscode-neovim/actions/workflows/build_test.yml"><img src="https://github.com/asvetliakov/vscode-neovim/workflows/Code%20Check%20&%20Test/badge.svg"></a>
<a href="https://gitter.im/vscode-neovim/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge"><img src="https://badges.gitter.im/vscode-neovim/community.svg"></a>
</p>

Real Neovim integration for Visual Studio Code.

[Neovim](https://neovim.io/) is a fork of VIM to allow greater extensibility and integration. This extension uses a full embedded Neovim instance, no more half-complete VIM emulation! Control is given to VSCode for insert mode and window/buffer/file management, making the best use of both editors.

## Features

-   Almost fully feature-complete VIM integration by utilizing neovim as a backend.
-   Supports custom `init.vim` and many vim/neovim plugins.
-   First-class VSCode insert mode. The plugin unbinds self from the `type` event in insert mode, so no more typing lag.
-   Full integration with VSCode features - autocompletion/go to definition/snippets/multiple cursors/etc.

## Requirements

Neovim 0.5.0-nightly or greater

## Installation

-   Install the [vscode-neovim](https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim) extension.
-   Install [Neovim](https://github.com/neovim/neovim/wiki/Installing-Neovim) **0.5.0 nightly** or greater. You can install neovim-0.5.0-nightly separately for just vscode, outside your system's package manager installation.
-   Set the neovim path in the extension settings. You must specify full path to neovim, like `"C:\Neovim\bin\nvim.exe"` or `"/usr/local/bin/nvim"`. The setting id is `"vscode-neovim.neovimExecutablePaths.win32/linux/darwin"`, depending on your system.
-   **Important:** If you already have big `init.vim` it is recommended to wrap existing settings & plugins with [`if !exists('g:vscode')`](#determining-if-running-in-vscode-in-your-initvim) to prevent potential problems. If you have any problems, try with empty `init.vim` first.

> :warning: **Neovim 0.5+** is **required**. Any version lower than that won't work. Many linux distributions have an **old** version of neovim in their package repo - always check what version are you installing.

> :info: If you get `"Unable to init vscode-neovim: command 'type' already exists"` message, uninstall other VSCode extensions that register `type` command (i.e. [VSCodeVim](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim) or [Overtype](https://marketplace.visualstudio.com/items?itemName=adammaras.overtype)).

#### WSL

If you want to use neovim from WSL, set `useWSL` configuration toggle and specify linux path to nvim binary. `wsl.exe` windows binary and `wslpath` linux binary are required for this. `wslpath` must be available through `$PATH` linux env setting. Use `wsl --list` to check for the correct default linux distribution.

## Tips and Features

### Important

-   Visual modes don't produce vscode selections. Any vscode commands expecting selection won't work. To round the corners, invoking the VSCode command picker from visual mode through the default hotkeys (<kbd>f1</kbd>/<kbd>ctrl/cmd+shift+p</kbd>) converts vim selection to real vscode selection. This conversion is done automatically for some commands like commenting and formatting.
-   If you're using some custom mapping for calling vscode commands that depends on real vscode selection, you can use `VSCodeNotifyRange`/`VSCodeNotifyRangePos` (the first one linewise, the latter characterwise) functions which will convert visual mode selection to vscode selection before calling the command. See [this for example](https://github.com/asvetliakov/vscode-neovim/blob/e61832119988bb1e73b81df72956878819426ce2/vim/vscode-code-actions.vim#L42-L54) and [mapping](https://github.com/asvetliakov/vscode-neovim/blob/e61832119988bb1e73b81df72956878819426ce2/vim/vscode-code-actions.vim#L98).
-   The extension works best if `editor.scrollBeyondLastLine` is disabled.
-   When you type some commands they may be substituted for the another, like `:write` will be replaced by `:Write`. This is normal.
-   File/tab/window management (`:w`/`:q`/etc) commands are substituted and mapped to vscode actions. If you're using some custom commands/custom mappings to them, you might need to rebind them to call vscode actions instead. See reference links below for examples if you want to use custom keybindings/commands. **DO NOT** use vim `:w`, etc in scripts/keybindings, they won't work.
-   On a Mac, the <kbd>h</kbd>, <kbd>j</kbd>, <kbd>k</kbd> and <kbd>l</kbd> movement keys may not repeat when held, to fix this open Terminal and execute the following command:
    `defaults write com.microsoft.VSCode ApplePressAndHoldEnabled -bool false`.

### VSCode specific differences

-   <kbd>=</kbd>, <kbd>==</kbd> are mapped to `editor.action.formatSelection`
-   It's possible to call vscode commands from neovim. See `VSCodeCall/VSCodeNotify` vim functions in `vscode-neovim.vim` file. `VSCodeCall` is blocking request, while `VSCodeNotify` is not (see below).
-   Scrolling is done by VSCode side. <kbd>C-d</kbd>/<kbd>C-u</kbd>/etc are slightly different.
-   File management commands such as <kbd>e</kbd> / <kbd>w</kbd> / <kbd>q</kbd> / etc are mapped to corresponding vscode commands
    and behavior may be different (see below).
-   <kbd>gd</kbd>/<kbd>C-]</kbd> are mapped to `editor.action.revealDefinition` (Shortcut `F12`), also <kbd>C-]</kbd> works
    in vim help files.
-   <kbd>gf</kbd> is mapped to `editor.action.revealDeclaration`
-   <kbd>gH</kbd> is mapped to `editor.action.referenceSearch.trigger`
-   <kbd>gD</kbd>/<kbd>gF</kbd> are mapped to `editor.action.peekDefinition` and `editor.action.peekDeclaration` respectively (opens in peek).
-   <kbd>C-w</kbd> <kbd>gd</kbd>/<kbd>C-w</kbd> <kbd>gf</kbd> are mapped to `editor.action.revealDefinitionAside` (original vim command -
    open new tab and go to the file under cursor, but vscode/vim window/tabs metaphors are completely different, so it's useful to do slightly different thing here).
-   <kbd>gh</kbd> is mapped to `editor.action.showHover`
-   Dot-repeat (<kbd>.</kbd>). Moving cursor within a change range won't break the repeat sequence. In neovim, if you type `abc<cursor>` in insert mode, then move cursor to `a<cursor>bc` and type `1` here the repeat sequence would be `1`. However in vscode it would be `a1bc`. Another difference is that when you delete some text in insert mode, dot repeat only works from right-to-left, meaning it will treat <kbd>Del</kbd> key as <kbd>BS</kbd> keys when running dot repeat.

### Performance problems

If you have any performance problems (cursor jitter usually) make sure you're not using these kinds of extensions:

-   Line number extensions (VSCode has built-in support for normal/relative line numbers)
-   Indent guide extensions (VSCode has built-in indent guides)
-   Brackets highlighter extensions (VSCode has built-in feature)
-   Anything that renders decorators/put something into vscode gutter very often, e.g. on each cursor/line move
-   VSCode extensions that delay the extension host like "Bracket Pair Colorizer"

Such extension may be fine and work well, but combined with any extension which should control the cursor position (such as any vim extension) it may work very bad, due to shared vscode extension host between all extensions (E.g. one extension is taking the control over the host and blocking the other extension, this produces jitter).

If you're not sure, disable all other extensions except mine, **reload vscode/window** and see if the problem persist before reporting.

Also there are reports that some vim settings/vim plugins increase latency and cause performance problems. Make sure you've disabled unneeded plugins. Many of them don't make sense with vscode and may cause problems. You don't need any code, highlighting, completion, lsp plugins as well any plugins that spawn windows/buffers (nerdtree and similar), fuzzy-finders plugins, etc. You might want to keep navigation/text-objects/text-editing/etc plugins - they should be fine.

### Custom escape keys

Since VSCode is responsible for insert mode, custom insert-mode vim mappings don't work. To map composite escape keys, put into your keybindings.json:

for <kbd>jj</kbd>

```json
{
    "command": "vscode-neovim.compositeEscape1",
    "key": "j",
    "when": "neovim.mode == insert && editorTextFocus",
    "args": "j"
}
```

to enable <kbd>jk</kbd> add also:

```json
{
    "command": "vscode-neovim.compositeEscape2",
    "key": "k",
    "when": "neovim.mode == insert && editorTextFocus",
    "args": "k"
}
```

### Conditional init.vim

To determine if neovim is running in vscode, add to your init.vim:

```vim
if exists('g:vscode')
    " VSCode extension
else
    " ordinary neovim
endif
```

To conditionally enable plugins, `vim-plug` has a [few solutions](https://github.com/junegunn/vim-plug/wiki/tips#conditional-activation).

For example, using the `Cond` helper, you can do the following to conditionally activate plugins while having them all still installed
([source](https://github.com/asvetliakov/vscode-neovim/issues/415#issuecomment-715533865)):

```vim
" inside plug#begin:
" use normal easymotion when in vim mode
Plug 'easymotion/vim-easymotion', Cond(!exists('g:vscode'))
" use vscode easymotion when in vscode mode
Plug 'asvetliakov/vim-easymotion', Cond(exists('g:vscode'), { 'as': 'vsc-easymotion' })
```

### Invoking vscode actions from neovim

There are [few helper functions](https://github.com/asvetliakov/vscode-neovim/blob/ecd361ff1968e597e2500e8ce1108830e918cfb8/vim/vscode-neovim.vim#L17-L39) that could be used to invoke any vscode commands:

-   `VSCodeNotify(command, ...)`/`VSCodeCall(command, ...)` - invokes vscode command with optional
    arguments.
-   `VSCodeNotifyRange(command, line1, line2, leaveSelection ,...)`/`VSCodeCallRange(command, line1, line2, leaveSelection, ...)` - produces real vscode selection from line1 to line2 and invokes vscode command. Linewise. Put 1 for `leaveSelection` argument to leave vscode selection after invoking the command.
-   `VSCodeNotifyRangePos(command, line1, line2, pos1, pos2, leaveSelection ,...)`/`VSCodeCallRangePos(command, line1, line2, pos1, pos2, leaveSelection, ...)` - produces real vscode selection from line1.pos1 to line2.pos2 and invokes vscode command. Characterwise.

Functions with `Notify` in name are non-blocking, the ones with `Call` are blocking. Generally **use Notify** unless you really need a blocking call.

_Examples_:

Produce linewise selection and show vscode commands (default binding)

```vim
function! s:showCommands()
    let startLine = line("v")
    let endLine = line(".")
    call VSCodeNotifyRange("workbench.action.showCommands", startLine, endLine, 1)
endfunction

xnoremap <silent> <C-P> <Cmd>call <SID>showCommands()<CR>
```

Produce characterwise selection and show vscode commands (default binding):

```vim
function! s:showCommands()
    let startPos = getpos("v")
    let endPos = getpos(".")
    call VSCodeNotifyRangePos("workbench.action.showCommands", startPos[1], endPos[1], startPos[2], endPos[2], 1)
endfunction

xnoremap <silent> <C-P> <Cmd>call <SID>showCommands()<CR>
```

Run Find in files for word under cursor in vscode:

```vim
nnoremap <silent> ? <Cmd>call VSCodeNotify('workbench.action.findInFiles', { 'query': expand('<cword>')})<CR>
```

Open definition aside (default binding):

```vim
nnoremap <silent> <C-w>gd <Cmd>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
```

### Jumplist

VSCode's jumplist is used instead of Neovim's. This is to make navigation caused by VSCode (mouse click, outline navigation, jump to definition, ect) be navigable. Make sure to bind to `workbench.action.navigateBack` / `workbench.action.navigateForward` if you're using custom mappings. Marks (both upper & lowercased) should be fine.

### Wildmenu completion

Command menu has the wildmenu completion on type. The completion options appear after 1.5s (to not bother you when you write `:w` or `:noh`). <kbd>Up</kbd>/<kbd>Down</kbd> selects the option and <kbd>Tab</kbd> accepts it. See the gif:

![wildmenu](/images/wildmenu.gif)

### Multiple cursors

Multiple cursors work in:

1. Insert mode
2. (Optional) Visual line mode
3. (Optional) Visual block mode

To spawn multiple cursors from visual line/block modes type <kbd>ma</kbd>/<kbd>mA</kbd> or <kbd>mi</kbd>/<kbd>mI</kbd> (by default). The effect differs:

-   For visual line mode <kbd>mi</kbd> will start insert mode on each selected line on the first non whitespace character and <kbd>ma</kbd> will on the end of line
-   For visual block mode <kbd>mi</kbd> will start insert on each selected line before the cursor block and <kbd>ma</kbd> after
-   <kbd>mA</kbd>/<kbd>mI</kbd> versions account empty lines too (only for visual line mode, for visual block mode they're same as <kbd>ma</kbd>/<kbd>mi</kbd>)

See gif in action:

![multicursors](/images/multicursor.gif)

### Keyboard Quickfix

By default, the quickfix menu can be opened using <kbd>z=</kbd> or <kbd>C-.</kbd>. However, it is currently [not possible](https://github.com/microsoft/vscode/issues/55111) to add mappings to the quickfix menu, so it can only be navigated with arrow keys. A [workaround vscode extension](https://marketplace.visualstudio.com/items?itemName=pascalsenn.keyboard-quickfix) has been made to use the quick open menu, which can be navigated with custom bindings.

To use, install the [keyboard-quickfix](https://marketplace.visualstudio.com/items?itemName=pascalsenn.keyboard-quickfix) extension, and add to your keybindings.json:

```jsonc
{
    "key": "ctrl+.",
    "command": "keyboard-quickfix.openQuickFix",
    "when": "editorHasCodeActionsProvider && editorTextFocus && !editorReadonly"
},
```

and add to your init.vim:

```vim
nnoremap z= <Cmd>call VSCodeNotify('keyboard-quickfix.openQuickFix')<CR>
```

## Bindings

**Custom keymaps for scrolling/window/tab/etc management**

-   See [vscode-scrolling.vim](/vim/vscode-scrolling.vim) for scrolling commands reference
-   See [vscode-file-commands.vim](/vim/vscode-file-commands.vim) for file commands reference
-   See [vscode-tab-commands.vim](/vim/vscode-tab-commands.vim) for tab commands reference
-   See [vscode-window-commands.vim](/vim/vscode-window-commands.vim) for window commands reference

### File/Tab management

| Command                                | Description                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:e[dit]` or `ex`                      | Without argument and without bang (`!`): opens quickopen window. <br/> Without argument and with bang: opens open file dialog. <br/> With filename, e.g. `:e $MYVIMRC`: opens a file in new tab. The file must exist. <br/> With filename and with bang e.g. `:e! $MYVIMRC`: closes current file (discard any changes) and opens a file. The file must exist. |
| `ene[w]`                               | Without bang: creates new untitled document in vscode. <br/> With bang: closes current file (discard any changes) and creates new untitled document.                                                                                                                                                                                                          |
| `fin[d]`                               | Opens vscode's quick open window. Arguments and count are not supported.                                                                                                                                                                                                                                                                                      |
| `w[rite]`                              | Without bang (`!`) saves current file With bang opens 'save as' dialog                                                                                                                                                                                                                                                                                        |
| `sav[eas]`                             | Opens 'save as' dialog.                                                                                                                                                                                                                                                                                                                                       |
| `wa[ll]`                               | Saves all files. Bang is not doing anything.                                                                                                                                                                                                                                                                                                                  |
| `q[uit]` or keys `<C-w> q` / `<C-w> c` | Closes the active editor.                                                                                                                                                                                                                                                                                                                                     |
| `wq`                                   | Saves and closes the active editor.                                                                                                                                                                                                                                                                                                                           |
| `qa[ll]`                               | Closes all editors, but doesn't quit vscode. Acts like `qall!`, so beware for a nonsaved changes.                                                                                                                                                                                                                                                             |
| `wqa[ll]`/`xa[ll]`                     | Saves all editors & close.                                                                                                                                                                                                                                                                                                                                    |
| `tabe[dit]`                            | Similar to `e[dit]`. Without argument opens quickopen, with argument opens the file in new tab.                                                                                                                                                                                                                                                               |
| `tabnew`                               | Opens new untitled file.                                                                                                                                                                                                                                                                                                                                      |
| `tabf[ind]`                            | Opens quickopen window.                                                                                                                                                                                                                                                                                                                                       |
| `tab`/`tabs`                           | Not supported. Doesn't make sense with vscode.                                                                                                                                                                                                                                                                                                                |
| `tabc[lose]`                           | Closes active editor (tab).                                                                                                                                                                                                                                                                                                                                   |
| `tabo[nly]`                            | Closes other tabs in vscode **group** (pane). This differs from vim where a `tab` is a like a new window, but doesn't make sense in vscode.                                                                                                                                                                                                                   |
| `tabn[ext]` or key `gt`                | Switches to next (or `count` tabs if argument is given) in the active vscode **group** (pane).                                                                                                                                                                                                                                                                |
| `tabp[revious]` or key `gT`            | Switches to previous (or `count` tabs if argument is given) in the active vscode **group** (pane).                                                                                                                                                                                                                                                            |
| `tabfir[st]`                           | Switches to the first tab in the active editor group.                                                                                                                                                                                                                                                                                                         |
| `tabl[ast]`                            | Switches to the last tab in the active edtior group.                                                                                                                                                                                                                                                                                                          |
| `tabm[ove]`                            | Not supported yet.                                                                                                                                                                                                                                                                                                                                            |

Keys <kbd>ZZ</kbd> and <kbd>ZQ</kbd> are bound to `:wq` and `q!` respectively

### Buffer/window management

_Note_: split size distribution is controlled by `workbench.editor.splitSizing` setting. By default, it's `distribute`, which is mapped to vim's `equalalways` and `eadirection = 'both'` (default).

| Command                        | Key                                                          | Description                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sp[lit]`                      | <kbd>C-w</kbd> <kbd>s</kbd>                                  | Split editor horizontally. <br/> When argument given opens the specified file in the argument, e.g `:sp $MYVIMRC`. File must exist.                                                                                                                                                                                                                        |
| `vs[plit]`                     | <kbd>C-w</kbd> <kbd>v</kbd>                                  | Split editor vertically. <br/> When argument given opens the specified file in the argument. File must exist.                                                                                                                                                                                                                                              |
| `new`                          | <kbd>C-w</kbd> <kbd>n</kbd>                                  | Like `sp[lit]` but creates new untitled file if no argument given.                                                                                                                                                                                                                                                                                         |
| `vne[w]`                       |                                                              | Like `vs[plit]` but creates new untitled file if no argument given.                                                                                                                                                                                                                                                                                        |
|                                | <kbd>C-w</kbd> <kbd>^</kbd>                                  | Not supported yet.                                                                                                                                                                                                                                                                                                                                         |
| `vert[ical]`/`lefta[bove]`/etc |                                                              | Not supported yet.                                                                                                                                                                                                                                                                                                                                         |
| `on[ly]`                       | <kbd>C-w</kbd> <kbd>o</kbd>                                  | Without bang (`!`): merges all editor groups into the one. **Doesn't** close editors. <br/> With bang: closes all editors from all groups except current one.                                                                                                                                                                                              |
|                                | <kbd>C-w</kbd> <kbd>j/k/h/l</kbd>                            | Focus group below/above/left/right.                                                                                                                                                                                                                                                                                                                        |
|                                | <kbd>C-w</kbd> <kbd>C-j/i/h/l</kbd>                          | Move editor to group below/above/left/right. Vim doesn't have analogue mappings. **Note**: <kbd>C-w</kbd> <kbd>C-i</kbd> moves editor up. Logically it should be <kbd>C-w</kbd> <kbd>C-k</kbd> but vscode has many commands mapped to <kbd>C-k</kbd> <kbd>[key]</kbd> and doesn't allow to use <kbd>C-w</kbd> <kbd>C-k</kbd> without unbinding them first. |
|                                | <kbd>C-w</kbd> <kbd>r/R/x</kbd>                              | Not supported, use <kbd>C-w</kbd> <kbd>C-j</kbd> and similar to move editors.                                                                                                                                                                                                                                                                              |
|                                | <kbd>C-w</kbd> <kbd>w</kbd> or <kbd>C-w</kbd> <kbd>C-w</kbd> | Focus next group. The behavior may differ than in vim.                                                                                                                                                                                                                                                                                                     |
|                                | <kbd>C-w</kbd> <kbd>W</kbd> or <kbd>C-w</kbd> <kbd>p</kbd>   | Focus previous group. The behavior may differ than in vim. <kbd>C-w</kbd> <kbd>p</kbd> is completely different than in vim.                                                                                                                                                                                                                                |
|                                | <kbd>C-w</kbd> <kbd>b</kbd>                                  | Focus last editor group (most bottom-right).                                                                                                                                                                                                                                                                                                               |
|                                | <kbd>C-w</kbd> <kbd>H/K/J/L</kbd>                            | Not supported yet.                                                                                                                                                                                                                                                                                                                                         |
|                                | <kbd>C-w</kbd> <kbd>=</kbd>                                  | Align all editors to have the same width.                                                                                                                                                                                                                                                                                                                  |
|                                | <kbd>[count] C-w</kbd> <kbd>+</kbd>                          | Increase editor height by (optional) count.                                                                                                                                                                                                                                                                                                                |
|                                | <kbd>[count] C-w</kbd> <kbd>-</kbd>                          | Decrease editor height by (optional) count.                                                                                                                                                                                                                                                                                                                |
|                                | <kbd>[count] C-w</kbd> <kbd>></kbd>                          | Increase editor width by (optional) count.                                                                                                                                                                                                                                                                                                                 |
|                                | <kbd>[count] C-w</kbd> <kbd>\<</kbd>                         | Decrease editor width by (optional) count.                                                                                                                                                                                                                                                                                                                 |
|                                | <kbd>C-w</kbd> <kbd>\_</kbd>                                 | Toggle maximized editor size. Pressing again will restore the size.                                                                                                                                                                                                                                                                                        |

To use VSCode command 'Increase/decrease current view size' instead of separate bindings for width and height:

-   `workbench.action.increaseViewSize`
-   `workbench.action.decreaseViewSize`
    <details>
    <summary>Copy this into init.vim</summary>

        function! s:manageEditorSize(...)
            let count = a:1
            let to = a:2
            for i in range(1, count ? count : 1)
                call VSCodeNotify(to ==# 'increase' ? 'workbench.action.increaseViewSize' : 'workbench.action.decreaseViewSize')
            endfor
        endfunction

        " Sample keybindings. Note these override default keybindings mentioned above.
        nnoremap <C-w>> <Cmd>call <SID>manageEditorSize(v:count, 'increase')<CR>
        xnoremap <C-w>> <Cmd>call <SID>manageEditorSize(v:count, 'increase')<CR>
        nnoremap <C-w>+ <Cmd>call <SID>manageEditorSize(v:count, 'increase')<CR>
        xnoremap <C-w>+ <Cmd>call <SID>manageEditorSize(v:count, 'increase')<CR>
        nnoremap <C-w>< <Cmd>call <SID>manageEditorSize(v:count, 'decrease')<CR>
        xnoremap <C-w>< <Cmd>call <SID>manageEditorSize(v:count, 'decrease')<CR>
        nnoremap <C-w>- <Cmd>call <SID>manageEditorSize(v:count, 'decrease')<CR>
        xnoremap <C-w>- <Cmd>call <SID>manageEditorSize(v:count, 'decrease')<CR>

    </details>

### Insert mode special keys

Enabled by `useCtrlKeysForInsertMode = true` (default true).

| Key                              | Description                                                       | Status                            |
| -------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| <kbd>C-r [0-9a-z"%#*+:.-=]</kbd> | Paste from register                                               | Works                             |
| <kbd>C-a</kbd>                   | Paste previous inserted content                                   | Works                             |
| <kbd>C-u</kbd>                   | Delete all text till beginning of line, if empty - delete newline | Bound to VSCode key               |
| <kbd>C-w</kbd>                   | Delete word left                                                  | Bound to VSCode key               |
| <kbd>C-h</kbd>                   | Delete character left                                             | Bound to VSCode key               |
| <kbd>C-t</kbd>                   | Indent lines right                                                | Bound to VSCode indent line       |
| <kbd>C-d</kbd>                   | Indent lines left                                                 | Bound to VSCode outindent line    |
| <kbd>C-j</kbd>                   | Insert line                                                       | Bound to VSCode insert line after |
| <kbd>C-c</kbd>                   | Escape                                                            | Works                             |

Other keys are not supported in insert mode.

### Normal mode control keys

Enabled by `useCtrlKeysForNormalMode = true` (default true).

Refer to vim manual for their use.

-   <kbd>C-a</kbd>
-   <kbd>C-b</kbd>
-   <kbd>C-c</kbd>
-   <kbd>C-d</kbd>
-   <kbd>C-e</kbd>
-   <kbd>C-f</kbd>
-   <kbd>C-i</kbd>
-   <kbd>C-o</kbd> (see https://github.com/asvetliakov/vscode-neovim/issues/181#issuecomment-585264621)
-   <kbd>C-r</kbd>
-   <kbd>C-u</kbd>
-   <kbd>C-v</kbd>
-   <kbd>C-w</kbd>
-   <kbd>C-x</kbd>
-   <kbd>C-y</kbd>
-   <kbd>C-]</kbd>
-   <kbd>C-j</kbd>
-   <kbd>C-k</kbd>
-   <kbd>C-l</kbd>
-   <kbd>C-h</kbd>
-   <kbd>C-/</kbd>

### Cmdline control keys (always enabled)

| Key                             | Desription                                                |
| ------------------------------- | --------------------------------------------------------- |
| <kbd>C-h</kbd>                  | Delete one character left.                                |
| <kbd>C-w</kbd>                  | Delete word left.                                         |
| <kbd>C-u</kbd>                  | Clear line.                                               |
| <kbd>C-g</kbd> / <kbd>C-t</kbd> | In incsearch mode moves to next/previous result.          |
| <kbd>C-l</kbd>                  | Add next character under the cursor to incsearch.         |
| <kbd>C-n</kbd> / <kbd>C-p</kbd> | Go down/up history.                                       |
| <kbd>Up</kbd>/<kbd>Down</kbd>   | Select next/prev suggestion (cannot be used for history). |
| <kbd>Tab</kbd>                  | Select suggestion.                                        |

### Custom keybindings

Control keys which are not in the above tables are not sent to neovim (as they are usually useless with vscode).

To pass additional ctrl keys to neovim, for example <kbd>C-Tab</kbd>, add to your keybindings.json:

```jsonc
{
    "command": "vscode-neovim.send",
    // the key sequence to activate the binding
    "key": "ctrl+tab",
    // don't activate during insert mode
    "when": "editorTextFocus && neovim.mode != insert",
    // the input to send to neovim
    "args": "<C-Tab>"
}
```

To disable existing ctrl key sequence, for example <kbd>C-A</kbd> add to your keybindings.json:

```json
{
    "command": "-vscode-neovim.send",
    "key": "ctrl+a"
}
```

## Vim Plugins

Most vim plugins will work out of the box, but certain plugins may require some fixes to work properly.

### Vim-easymotion

While the original [vim-easymotion](https://github.com/easymotion/vim-easymotion) functions as expected, it works by replacing your text with markers then restoring back, which leads to broken text and many errors reported in VSCode.

For this reason I created the special [vim-easymotion fork](https://github.com/asvetliakov/vim-easymotion) which doesn't touch your text and instead use vscode text decorations. Just add my fork to your `vim-plug` block or by using your favorite vim plugin installer and delete original vim-easymotion. Also overwin motions won't work (obviously) so don't use them.

By default, text decorations will appear behind of the associated text as shown in the screenshot. To show the decorations on top of the text, set `vscode-neovim.textDecorationsAtTop` to true.

Happy jumping!

![easymotion](/images/easy-motion-vscode.png)

### Vim-commentary

You can use [vim-commentary](https://github.com/tpope/vim-commentary) if you like it. But vscode already has such functionality so why don't use it? Add to your init.vim/init.nvim:

```vim
xmap gc  <Plug>VSCodeCommentary
nmap gc  <Plug>VSCodeCommentary
omap gc  <Plug>VSCodeCommentary
nmap gcc <Plug>VSCodeCommentaryLine
```

Similar to vim-commentary, gcc is comment line (accept count), use gc with motion/in visual mode. `VSCodeCommentary` is just a simple function which calls `editor.action.commentLine`.

### VIM quick-scope

[quick-scope](https://github.com/unblevable/quick-scope) plugin uses default vim HL groups by default but they are normally ignored. To fix, add

```vim
highlight QuickScopePrimary guifg='#afff5f' gui=underline ctermfg=155 cterm=underline
highlight QuickScopeSecondary guifg='#5fffff' gui=underline ctermfg=81 cterm=underline
```

to your init.vim. The underline color can be changed by the `guisp` tag.

## Known Issues

See [Issues section](https://github.com/asvetliakov/vscode-neovim/issues).

## How it works

-   VScode connects to neovim instance
-   When opening a some file, a scratch buffer is created in nvim and being init with text content from vscode
-   Normal/visual mode commands are being sent directly to neovim. The extension listens for buffer events and applies edits from neovim
-   When entering the insert mode, the extensions stops listen for keystroke events and delegates typing mode to vscode (no neovim communication is being performed here)
-   After pressing escape key from the insert mode, extension sends changes obtained from the insert mode to neovim

## Credits & External Resources

-   [vim-altercmd](https://github.com/kana/vim-altercmd) - Used for rebinding default commands to call vscode command
-   [neovim nodejs client](https://github.com/neovim/node-client) - NodeJS library for communicating with Neovim
