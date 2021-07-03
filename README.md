<h2 align="center"><img src="./images/icon.png" height="128"><br>VSCode Neovim</h2>
<p align="center"><strong>VSCode Neovim Integration</strong></p>

<p align=center>
<a href="https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim"><img src="https://vsmarketplacebadge.apphb.com/version/asvetliakov.vscode-neovim.svg"></a>
<a href="https://github.com/asvetliakov/vscode-neovim/actions/workflows/build_test.yml"><img src="https://github.com/asvetliakov/vscode-neovim/workflows/Code%20Check%20&%20Test/badge.svg"></a>
<a href="https://gitter.im/vscode-neovim/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge"><img src="https://badges.gitter.im/vscode-neovim/community.svg"></a>
</p>

[Neovim](https://neovim.io/) is a fork of VIM to allow greater extensibility and integration. This extension uses a full
embedded Neovim instance, no more half-complete VIM emulation! VSCode's native functionality is used for insert mode and
editor commands, making the best use of both editors.

-   🎉 Almost fully feature-complete VIM integration by utilizing neovim as a backend.
-   🔧 Supports custom `init.vim` and many vim plugins.
-   🥇 First-class and lag-free insert mode, letting VSCode do what it does best.
-   🤝 Complete integration with VSCode features (lsp/autocompletion/snippets/multi-cursor/etc).

<details>
 <summary><strong>Table of Contents</strong> (click to expand)</summary>

-   [🧰 Installation](#-installation)
-   [💡 Tips and Features](#-tips-and-features)
    -   [Important](#important)
    -   [VSCode specific differences](#vscode-specific-differences)
    -   [Performance problems](#performance-problems)
    -   [Conditional init.vim](#conditional-initvim)
    -   [Custom escape keys](#custom-escape-keys)
    -   [Jumplist](#jumplist)
    -   [Wildmenu completion](#wildmenu-completion)
    -   [Multiple cursors](#multiple-cursors)
    -   [Keyboard Quickfix](#keyboard-quickfix)
    -   [Invoking VSCode actions from neovim](#invoking-vscode-actions-from-neovim)
        -   [Examples](#examples)
-   [⌨️ Bindings](#️-bindings)
    -   [File management](#file-management)
    -   [Tab management](#tab-management)
    -   [Buffer/window management](#bufferwindow-management)
    -   [Insert mode special keys](#insert-mode-special-keys)
    -   [Normal mode control keys](#normal-mode-control-keys)
    -   [Cmdline special keys](#cmdline-special-keys)
    -   [VSCode specific bindings](#vscode-specific-bindings)
        -   [Editor command](#editor-command)
        -   [Explorer/list navigation](#explorerlist-navigation)
        -   [Explorer file manipulation](#explorer-file-manipulation)
    -   [Custom keybindings](#custom-keybindings)
-   [🤝 Vim Plugins](#-vim-plugins)
    -   [vim-easymotion](#vim-easymotion)
    -   [vim-commentary](#vim-commentary)
    -   [quick-scope](#quick-scope)
-   [📑 How it works](#-how-it-works)
-   [❤️ Credits & External Resources](#️-credits--external-resources)

</details>

## 🧰 Installation

-   Install the [vscode-neovim](https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim)
    extension.
-   Install [Neovim](https://github.com/neovim/neovim/wiki/Installing-Neovim) **0.5.0** or greater.
    -   Set the neovim path in the extension settings. You must specify full path to neovim, like
        "`C:\Neovim\bin\nvim.exe"` or "`/usr/local/bin/nvim`".
    -   The setting id is "`vscode-neovim.neovimExecutablePaths.win32/linux/darwin`", respective to your system.
-   If you want to use neovim from WSL, set the `useWSL` configuration toggle and specify linux path to nvim binary.
    `wsl.exe` windows binary and `wslpath` linux binary are required for this. `wslpath` must be available through
    `$PATH` linux env setting. Use `wsl --list` to check for the correct default linux distribution.

> ❗ **Neovim 0.5.0** or greater is **required**. Any version lower than that won't work. Many linux distributions have
> an **old** version of neovim in their package repo - always check what version are you installing. You can install
> neovim separately, outside your system's package manager installation, for example using the appimage from the neovim
> releases page.

> 🐛 See the [issues section](https://github.com/asvetliakov/vscode-neovim/issues) for known issues.

## 💡 Tips and Features

### Important

-   If you get "Unable to init vscode-neovim: command 'type' already exists" message, uninstall other VSCode extensions
    that register the `type` command (like
    [VSCodeVim](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim) or
    [Overtype](https://marketplace.visualstudio.com/items?itemName=adammaras.overtype)).
-   If you already have a big `init.vim` it is recommended to wrap existing settings & plugins with
    [`if !exists('g:vscode')`](#conditional-initvim) to prevent potential conflicts. If you have any problems, try with
    empty `init.vim` first.
-   On a Mac, the <kbd>h</kbd>, <kbd>j</kbd>, <kbd>k</kbd> and <kbd>l</kbd> movement keys may not repeat when held, to
    fix this open Terminal and execute the following command:
    `defaults write com.microsoft.VSCode ApplePressAndHoldEnabled -bool false`.
-   The extension works best if `editor.scrollBeyondLastLine` is disabled.

### VSCode specific differences

-   File and editor management commands such as `:e`/`:w`/`:q`/`:vsplit`/`:tabnext`/etc are mapped to corresponding
    vscode commands and behavior may be different ([see below](#️-bindings)). **Do not** use vim commands like `:w` in
    scripts/keybindings, they won't work. If you're using them in some custom commands/mappings, you might need to
    rebind them to call vscode commands from neovim with `VSCodeCall/VSCodeNotify`
    ([see below](#invoking-vscode-actions-from-neovim)).
-   Visual modes don't produce vscode selections, so any vscode commands expecting selection won't work. To round the
    corners, invoking the VSCode command picker from visual mode through the default hotkeys
    (<kbd>f1</kbd>/<kbd>ctrl/cmd+shift+p</kbd>) converts vim selection to real vscode selection. This conversion is also
    done automatically for some commands like commenting and formatting. If you're using some custom mapping for calling
    vscode commands that depends on real vscode selection, you can use
    `VSCodeNotifyRange`/`VSCodeNotifyRangePos`/`VSCodeNotifyVisual` (linewise, characterwise, and automatic) which will
    convert vim visual mode selection to vscode selection before calling the command
    ([see below](#invoking-vscode-actions-from-neovim)).
-   When you type some commands they may be substituted for the another, like `:write` will be replaced by `:Write`.
-   Scrolling is done by VSCode. <kbd>C-d</kbd>/<kbd>C-u</kbd>/etc are slightly different.
-   Editor customization (relative line number, scrolloff, etc) is handled by VSCode.
-   Dot-repeat (<kbd>.</kbd>) is slightly different - moving the cursor within a change range won't break the repeat.
    sequence. In neovim, if you type `abc<cursor>` in insert mode, then move cursor to `a<cursor>bc` and type `1` here
    the repeat sequence would be `1`. However in vscode it would be `a1bc`. Another difference is that when you delete
    some text in insert mode, dot repeat only works from right-to-left, meaning it will treat <kbd>Del</kbd> key as
    <kbd>BS</kbd> keys when running dot repeat.

### Performance problems

If you have any performance problems (cursor jitter usually) make sure you're not using these kinds of extensions:

-   Anything that renders decorators very often:
    -   Line number extensions (VSCode has built-in support for normal/relative line numbers)
    -   Indent guide extensions (VSCode has built-in indent guides)
    -   Brackets highlighter extensions (VSCode has built-in feature)
-   VSCode extensions that delay the extension host like "Bracket Pair Colorizer"
-   VIM plugins that increase latency and cause performance problems.
    -   Make sure to disable unneeded plugins, as many of them don't make sense with vscode and may cause problems.
    -   You don't need any code, highlighting, completion, lsp plugins as well any plugins that spawn windows/buffers
        (nerdtree and similar), fuzzy-finders, etc.
    -   Many navigation/textobject/editing plugins should be fine.

If you're not sure, disable all other extensions, **reload vscode window**, and see if the problem persists before
reporting.

### Conditional init.vim

To determine if neovim is running in vscode, add to your init.vim:

```vim
if exists('g:vscode')
    " VSCode extension
else
    " ordinary neovim
endif
```

To conditionally activate plugins, `vim-plug` has a
[few solutions](https://github.com/junegunn/vim-plug/wiki/tips#conditional-activation). For example, using the `Cond`
helper, you can conditionally activate installed plugins
([source](https://github.com/asvetliakov/vscode-neovim/issues/415#issuecomment-715533865)):

```vim
" inside plug#begin:
" use normal easymotion when in vim mode
Plug 'easymotion/vim-easymotion', Cond(!exists('g:vscode'))
" use vscode easymotion when in vscode mode
Plug 'asvetliakov/vim-easymotion', Cond(exists('g:vscode'), { 'as': 'vsc-easymotion' })
```

### Custom escape keys

Since VSCode is responsible for insert mode, custom insert-mode vim mappings don't work. To map composite escape keys,
put into your keybindings.json:

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

Currently, there is no way to map both `jk` and `kj`, or to map `jk` without also mapping `jj`.

### Jumplist

VSCode's jumplist is used instead of Neovim's. This is to make VSCode native navigation (mouse click, jump to
definition, ect) navigable through the jumplist.

Make sure to bind to `workbench.action.navigateBack` / `workbench.action.navigateForward` if you're using custom
mappings. Marks (both upper & lowercased) should work fine.

### Wildmenu completion

Command menu has the wildmenu completion on type. The completion options appear after 1.5s (to not bother you when you
write `:w` or `:noh`). <kbd>Up</kbd>/<kbd>Down</kbd> selects the option and <kbd>Tab</kbd> accepts it. See the gif:

![wildmenu](/images/wildmenu.gif)

### Multiple cursors

Multiple cursors work in:

1. Insert mode
2. Visual line mode
3. Visual block mode

To spawn multiple cursors from visual line/block modes type <kbd>ma</kbd>/<kbd>mA</kbd> or <kbd>mi</kbd>/<kbd>mI</kbd>
(by default). The effect differs:

-   For visual line mode, <kbd>mi</kbd> will start insert mode on each selected line on the first non whitespace
    character and <kbd>ma</kbd> will on the end of line.
-   For visual block mode, <kbd>mi</kbd> will start insert on each selected line before the cursor block and
    <kbd>ma</kbd> after.
-   <kbd>mA</kbd>/<kbd>mI</kbd> versions accounts for empty lines (only for visual line mode, for visual block mode
    they're same as <kbd>ma</kbd>/<kbd>mi</kbd>).

See gif in action:

![multicursors](/images/multicursor.gif)

### Keyboard Quickfix

By default, the quickfix menu can be opened using <kbd>z=</kbd> or <kbd>C-.</kbd>. However, it is currently
[not possible](https://github.com/microsoft/vscode/issues/55111) to add mappings to the quickfix menu, so it can only be
navigated with arrow keys. A
[workaround vscode extension](https://marketplace.visualstudio.com/items?itemName=pascalsenn.keyboard-quickfix) has been
made to use the quick open menu, which can be navigated with custom bindings.

To use, install the
[keyboard-quickfix](https://marketplace.visualstudio.com/items?itemName=pascalsenn.keyboard-quickfix) extension, and add
to your keybindings.json:

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

### Invoking VSCode actions from neovim

There are a
[few helper functions](https://github.com/asvetliakov/vscode-neovim/blob/master/vim/vscode-neovim.vim#L17-L39) that
could be used to invoke any vscode commands:

| Command                                                                                                                                                           | Description                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VSCodeNotify(command, ...)` <br/> `VSCodeCall(command, ...)`                                                                                                     | Invoke vscode command with optional arguments.                                                                                                                                                             |
| `VSCodeNotifyRange(command, line1, line2, leaveSelection ,...)` <br/> `VSCodeCallRange(command, line1, line2, leaveSelection, ...)`                               | Produce linewise vscode selection from `line1` to `line2` and invoke vscode command. Setting `leaveSelection` to 1 removes vscode selection after invoking the command.                                    |
| `VSCodeNotifyRangePos(command, line1, line2, pos1, pos2, leaveSelection ,...)` <br/> `VSCodeCallRangePos(command, line1, line2, pos1, pos2, leaveSelection, ...)` | Produce characterwise vscode selection from `line1.pos1` to `line2.pos2` and invoke vscode command.                                                                                                        |
| `VSCodeNotifyVisual(command, leaveSelection, ...)` <br/> `VSCodeCallVisual(command, leaveSelection, ...)`                                                         | Produce linewise (visual line) or characterwise (visual and visual block) selection from visual mode selection and invoke vscode command. Behaves like `VSCodeNotify/Call` when visual mode is not active. |

> 💡 Functions with `Notify` in their name are non-blocking, the ones with `Call` are blocking. Generally **use Notify**
> unless you really need a blocking call.

#### Examples

Produce linewise/characterwise selection and show vscode commands (default binding):

```vim
function! VSCodeNotifyVisual(cmd, leaveSelection, ...)
    let mode = mode()
    if mode ==# 'V'
        let startLine = line('v')
        let endLine = line('.')
        call VSCodeNotifyRange(a:cmd, startLine, endLine, a:leaveSelection, a:000)
    elseif mode ==# 'v' || mode ==# "\<C-v>"
        let startPos = getpos('v')
        let endPos = getpos('.')
        call VSCodeNotifyRangePos(a:cmd, startPos[1], endPos[1], startPos[2], endPos[2] + 1, a:leaveSelection, a:000)
    else
        call VSCodeNotify(a:cmd, a:000)
    endif
endfunction

xnoremap <C-S-P> <Cmd>call VSCodeNotifyVisual('workbench.action.showCommands', 1)<CR>
```

Open definition aside (default binding):

```vim
nnoremap <C-w>gd <Cmd>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
```

Run Find in files for word under cursor in vscode:

```vim
nnoremap ? <Cmd>call VSCodeNotify('workbench.action.findInFiles', { 'query': expand('<cword>')})<CR>
```

## ⌨️ Bindings

**Custom keymaps for scrolling/window/tab/etc management**

-   See [vscode-scrolling.vim](/vim/vscode-scrolling.vim) for scrolling commands reference
-   See [vscode-file-commands.vim](/vim/vscode-file-commands.vim) for file commands reference
-   See [vscode-tab-commands.vim](/vim/vscode-tab-commands.vim) for tab commands reference
-   See [vscode-window-commands.vim](/vim/vscode-window-commands.vim) for window commands reference

> 💡 "With bang" refers to adding a "!" to the end of a command.

### File management

| Command                                                                              | Description                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e[dit]` / `ex`                                                                      | Open quickopen. <br/> With filename, e.g. `:e $MYVIMRC`: open the file in new tab. The file must exist. <br/> With bang: revert file to last saved version. <br/> With filename and bang e.g. `:e! $MYVIMRC`: close current file (discard any changes) and open the file. The file must exist. |
| `ene[w]`                                                                             | Create new untitled document in vscode. <br/> With bang: close current file (discard any changes) and create new document.                                                                                                                                                                     |
| `fin[d]`                                                                             | Open vscode's quick open window. Arguments and count are not supported.                                                                                                                                                                                                                        |
| `w[rite]`                                                                            | Save current file. With bang: open 'save as' dialog.                                                                                                                                                                                                                                           |
| `sav[eas]`                                                                           | Open 'save as' dialog.                                                                                                                                                                                                                                                                         |
| `wa[ll]`                                                                             | Save all files.                                                                                                                                                                                                                                                                                |
| `q[uit]` / <kbd>C-w</kbd> <kbd>q</kbd> / <kbd>C-w</kbd> <kbd>c</kbd> / <kbd>ZQ</kbd> | Close the active editor. With bang: revert changes and close the active editor.                                                                                                                                                                                                                |
| `wq` / <kbd>ZZ</kbd>                                                                 | Save and close the active editor.                                                                                                                                                                                                                                                              |
| `qa[ll]`                                                                             | Close all editors, but don't quit vscode. Acts like `qall!`, so beware for nonsaved changes.                                                                                                                                                                                                   |
| `wqa[ll]` / `xa[ll]`                                                                 | Save all editors & close.                                                                                                                                                                                                                                                                      |

### Tab management

| Command                         | Description                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `tabe[dit]`                     | Similar to `e[dit]`. Open quickopen. <br/> With argument: open the file in new tab.                                                        |
| `tabnew`                        | Open new untitled file.                                                                                                                    |
| `tabf[ind]`                     | Open quickopen window.                                                                                                                     |
| `tab`/`tabs`                    | Not supported. Doesn't make sense with vscode.                                                                                             |
| `tabc[lose]`                    | Close active editor (tab).                                                                                                                 |
| `tabo[nly]`                     | Close other tabs in vscode **group** (pane). This differs from vim where a `tab` is a like a new window, but doesn't make sense in vscode. |
| `tabn[ext]` / <kbd>gt</kbd>     | Switch to next (or `count` tabs if argument is given) in the active vscode **group** (pane).                                               |
| `tabp[revious]` / <kbd>gT</kbd> | Switch to previous (or `count` tabs if argument is given) in the active vscode **group** (pane).                                           |
| `tabfir[st]`                    | Switch to the first tab in the active editor group.                                                                                        |
| `tabl[ast]`                     | Switch to the last tab in the active editor group.                                                                                         |
| `tabm[ove]`                     | Not supported yet.                                                                                                                         |

### Buffer/window management

| Command    | Key                                                          | Description                                                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sp[lit]`  | <kbd>C-w</kbd> <kbd>s</kbd>                                  | Split editor horizontally. <br/> With argument: open the specified file, e.g `:sp $MYVIMRC`. File must exist.                                                                                                                                                                                                              |
| `vs[plit]` | <kbd>C-w</kbd> <kbd>v</kbd>                                  | Split editor vertically. <br/> With argument: open the specified file. File must exist.                                                                                                                                                                                                                                    |
| `new`      | <kbd>C-w</kbd> <kbd>n</kbd>                                  | Like `sp[lit]` but create new untitled file if no argument given.                                                                                                                                                                                                                                                          |
| `vne[w]`   |                                                              | Like `vs[plit]` but create new untitled file if no argument given.                                                                                                                                                                                                                                                         |
|            | <kbd>C-w</kbd> <kbd>=</kbd>                                  | Align all editors to have the same width.                                                                                                                                                                                                                                                                                  |
|            | <kbd>C-w</kbd> <kbd>\_</kbd>                                 | Toggle maximized editor size. Pressing again will restore the size.                                                                                                                                                                                                                                                        |
|            | <kbd>[count]</kbd> <kbd>C-w</kbd> <kbd>+</kbd>               | Increase editor height by (optional) count.                                                                                                                                                                                                                                                                                |
|            | <kbd>[count]</kbd> <kbd>C-w</kbd> <kbd>-</kbd>               | Decrease editor height by (optional) count.                                                                                                                                                                                                                                                                                |
|            | <kbd>[count]</kbd> <kbd>C-w</kbd> <kbd>></kbd>               | Increase editor width by (optional) count.                                                                                                                                                                                                                                                                                 |
|            | <kbd>[count]</kbd> <kbd>C-w</kbd> <kbd>\<</kbd>              | Decrease editor width by (optional) count.                                                                                                                                                                                                                                                                                 |
| `on[ly]`   | <kbd>C-w</kbd> <kbd>o</kbd>                                  | Without bang: merge all editor groups into the one. Don't close editors. <br/> With bang: close all editors from all groups except current one.                                                                                                                                                                            |
|            | <kbd>C-w</kbd> <kbd>j/k/h/l</kbd>                            | Focus group below/above/left/right.                                                                                                                                                                                                                                                                                        |
|            | <kbd>C-w</kbd> <kbd>C-j/i/h/l</kbd>                          | Move editor to group below/above/left/right. <br/> **Note**: <kbd>C-w</kbd> <kbd>C-i</kbd> moves editor up. Ideally it should be <kbd>C-w</kbd> <kbd>C-k</kbd> but vscode has many commands mapped to <kbd>C-k</kbd> <kbd>[key]</kbd> and doesn't allow to use <kbd>C-w</kbd> <kbd>C-k</kbd> without unbinding them first. |
|            | <kbd>C-w</kbd> <kbd>J/K/H/L</kbd>                            | Move whole editor group below/above/left/right.                                                                                                                                                                                                                                                                            |
|            | <kbd>C-w</kbd> <kbd>w</kbd> or <kbd>C-w</kbd> <kbd>C-w</kbd> | Focus next group. The behavior may differ than in vim.                                                                                                                                                                                                                                                                     |
|            | <kbd>C-w</kbd> <kbd>W</kbd> or <kbd>C-w</kbd> <kbd>p</kbd>   | Focus previous group. The behavior may differ than in vim. <kbd>C-w</kbd> <kbd>p</kbd> is completely different than in vim.                                                                                                                                                                                                |
|            | <kbd>C-w</kbd> <kbd>b</kbd>                                  | Focus last editor group (most bottom-right).                                                                                                                                                                                                                                                                               |
|            | <kbd>C-w</kbd> <kbd>r/R/x</kbd>                              | Not supported, use <kbd>C-w</kbd> <kbd>C-j</kbd> and similar to move editors.                                                                                                                                                                                                                                              |

> 💡 Split size distribution is controlled by `workbench.editor.splitSizing` setting. By default, it's `distribute`,
> which is equal to vim's `equalalways` and `eadirection = 'both'` (default).

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

Enabled by `useCtrlKeysForInsertMode` (default true).

| Key                                         | Description                                                       | Status                            |
| ------------------------------------------- | ----------------------------------------------------------------- | --------------------------------- |
| <kbd>C-r</kbd> <kbd>[0-9a-z"%#*+:.-=]</kbd> | Paste from register.                                              | Works                             |
| <kbd>C-a</kbd>                              | Paste previous inserted content.                                  | Works                             |
| <kbd>C-o</kbd>                              | Switch to normal mode for a single command, then back.            | Works                             |
| <kbd>C-u</kbd>                              | Delete all text till beginning of line. If empty, delete newline. | Bound to VSCode key               |
| <kbd>C-w</kbd>                              | Delete word left.                                                 | Bound to VSCode key               |
| <kbd>C-h</kbd>                              | Delete character left.                                            | Bound to VSCode key               |
| <kbd>C-t</kbd>                              | Indent lines right.                                               | Bound to VSCode indent line       |
| <kbd>C-d</kbd>                              | Indent lines left.                                                | Bound to VSCode outindent line    |
| <kbd>C-j</kbd>                              | Insert line.                                                      | Bound to VSCode insert line after |
| <kbd>C-c</kbd>                              | Escape.                                                           | Works                             |

Other keys are not supported in insert mode.

### Normal mode control keys

Enabled by `useCtrlKeysForNormalMode` (default true).

Refer to vim manual for their use.

-   <kbd>C-a</kbd>
-   <kbd>C-b</kbd>
-   <kbd>C-c</kbd>
-   <kbd>C-d</kbd>
-   <kbd>C-e</kbd>
-   <kbd>C-f</kbd>
-   <kbd>C-i</kbd>
-   <kbd>C-o</kbd>
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

### Cmdline special keys

Always enabled.

| Key                             | Desription                                                |
| ------------------------------- | --------------------------------------------------------- |
| <kbd>C-h</kbd>                  | Delete one character left.                                |
| <kbd>C-w</kbd>                  | Delete word left.                                         |
| <kbd>C-u</kbd>                  | Clear line.                                               |
| <kbd>C-g</kbd> / <kbd>C-t</kbd> | In incsearch mode moves to next/previous result.          |
| <kbd>C-l</kbd>                  | Add next character under the cursor to incsearch.         |
| <kbd>C-n</kbd> / <kbd>C-p</kbd> | Go down/up history.                                       |
| <kbd>Up</kbd> / <kbd>Down</kbd> | Select next/prev suggestion (cannot be used for history). |
| <kbd>Tab</kbd>                  | Select suggestion.                                        |

### VSCode specific bindings

#### Editor command

| Key                                                         | VSCode Command                                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| <kbd>=</kbd> / <kbd>==</kbd>                                | `editor.action.formatSelection`                                                                |
| <kbd>gh</kbd> / <kbd>K</kbd>                                | `editor.action.showHover`                                                                      |
| <kbd>gd</kbd> / <kbd>C-]</kbd>                              | `editor.action.revealDefinition` <br/> Also works in vim help.                                 |
| <kbd>gf</kbd>                                               | `editor.action.revealDeclaration`                                                              |
| <kbd>gH</kbd>                                               | `editor.action.referenceSearch.trigger`                                                        |
| <kbd>gO</kbd>                                               | `workbench.action.gotoSymbol`                                                                  |
| <kbd>C-w</kbd> <kbd>gd</kbd> / <kbd>C-w</kbd> <kbd>gf</kbd> | `editor.action.revealDefinitionAside`                                                          |
| <kbd>gD</kbd>                                               | `editor.action.peekDefinition`                                                                 |
| <kbd>gF</kbd>                                               | `editor.action.peekDeclaration`                                                                |
| <kbd>Tab</kbd>                                              | `togglePeekWidgetFocus` <br/> Switch between peek editor and reference list.                   |
| <kbd>C-n</kbd> / <kbd>C-p</kbd>                             | Navigate lists, parameter hints, suggestions, quick-open, cmdline history, peek reference list |

> 💡 To specify the default peek mode, modify `editor.peekWidgetDefaultFocus` in your settings.

#### Explorer/list navigation

| Key                                | VSCode Command                  |
| ---------------------------------- | ------------------------------- |
| <kbd>j</kbd> / <kbd>k</kbd>        | `list.focusDown/Up`             |
| <kbd>h</kbd> / <kbd>l</kbd>        | `list.collapse/select`          |
| <kbd>Enter</kbd>                   | `list.select`                   |
| <kbd>gg</kbd>                      | `list.focusFirst`               |
| <kbd>G</kbd>                       | `list.focusLast`                |
| <kbd>o</kbd>                       | `list.toggleExpand`             |
| <kbd>C-u</kbd> / <kbd>C-d</kbd>    | `list.focusPageUp/Down`         |
| <kbd> / </kbd> / <kbd>Escape</kbd> | `list.toggleKeyboardNavigation` |

> 💡 To enable explorer list navigation, add `"workbench.list.automaticKeyboardNavigation": false` to your
> `settings.json`.

#### Explorer file manipulation

| Key          | VSCode Command        |
| ------------ | --------------------- |
| <kbd>r</kbd> | `renameFile`          |
| <kbd>d</kbd> | `deleteFile`          |
| <kbd>y</kbd> | `filesExplorer.copy`  |
| <kbd>x</kbd> | `filesExplorer.cut`   |
| <kbd>p</kbd> | `filesExplorer.paste` |
| <kbd>v</kbd> | `explorer.openToSide` |
| <kbd>a</kbd> | `explorer.newFile`    |
| <kbd>A</kbd> | `explorer.newFolder`  |

### Custom keybindings

Control keys which are not in the above tables are not sent to neovim by default. To pass additional ctrl keys to
neovim, for example <kbd>C-Tab</kbd>, add to your keybindings.json:

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

To disable existing an ctrl key sequence, for example <kbd>C-A</kbd> add to your keybindings.json:

```json
{
    "command": "-vscode-neovim.send",
    "key": "ctrl+a"
}
```

## 🤝 Vim Plugins

Most vim plugins will work out of the box, but certain plugins may require some fixes to work properly.

### vim-easymotion

While the original [vim-easymotion](https://github.com/easymotion/vim-easymotion) functions as expected, it works by
replacing your text with markers then restoring back, which leads to broken text and many errors reported in VSCode.

For this reason I created the special [vim-easymotion fork](https://github.com/asvetliakov/vim-easymotion) which doesn't
touch your text and instead use vscode text decorations. Just add my fork to your `vim-plug` block or by using your
favorite vim plugin installer and delete original vim-easymotion. Also overwin motions won't work (obviously) so don't
use them.

By default, text decorations will appear behind of the associated text as shown in the screenshot. To show the
decorations on top of the text, set `vscode-neovim.textDecorationsAtTop` to true.

Happy jumping!

![easymotion](/images/easy-motion-vscode.png)

### vim-commentary

You can use [vim-commentary](https://github.com/tpope/vim-commentary) if you like it. But vscode already has such
functionality so why don't use it? Add to your init.vim/init.nvim:

```vim
xmap gc  <Plug>VSCodeCommentary
nmap gc  <Plug>VSCodeCommentary
omap gc  <Plug>VSCodeCommentary
nmap gcc <Plug>VSCodeCommentaryLine
```

Similar to vim-commentary, gcc is comment line (accept count), use gc with motion/in visual mode. `VSCodeCommentary` is
just a simple function which calls `editor.action.commentLine`.

### quick-scope

[quick-scope](https://github.com/unblevable/quick-scope) plugin uses default vim HL groups by default but they are
normally ignored. To fix, add

```vim
highlight QuickScopePrimary guifg='#afff5f' gui=underline ctermfg=155 cterm=underline
highlight QuickScopeSecondary guifg='#5fffff' gui=underline ctermfg=81 cterm=underline
```

to your init.vim. The underline color can be changed by the `guisp` tag.

## 📑 How it works

-   VScode connects to neovim instance
-   When opening a some file, a scratch buffer is created in nvim and being init with text content from vscode
-   Normal/visual mode commands are being sent directly to neovim. The extension listens for buffer events and applies
    edits from neovim
-   When entering the insert mode, the extensions stops listen for keystroke events and delegates typing mode to vscode
    (no neovim communication is being performed here)
-   After pressing escape key from the insert mode, extension sends changes obtained from the insert mode to neovim

## ❤️ Credits & External Resources

-   [vim-altercmd](https://github.com/kana/vim-altercmd) - Used for rebinding default commands to call vscode command
-   [neovim nodejs client](https://github.com/neovim/node-client) - NodeJS library for communicating with Neovim
-   [VSCodeVim](https://github.com/VSCodeVim/Vim) - Used for various inspiration
