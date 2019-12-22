# Neo Vim (VS Code Neovim)

Neovim integration for Visual Studio Code

For those who don't know [Neovim](https://neovim.io/) is the fork of VIM to allow greater VIM extensibility and embeddability. The extension is using full embedded neovim instance as backend (with the exception of the insert mode and window/buffer/file management), no more half-complete VIM emulation

VSCodeVim has neovim integration but it doesn't use it for anything but ex-commands (e.g. commands like ```:normal```) and relying for own emulated implementation for anything else.

Please report any issues/suggestions to [vscode-neovim repository](https://github.com/asvetliakov/vscode-neovim)

## Installation

* Install [vscode-neovim](https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim) extension
* Install [Neovim](https://github.com/neovim/neovim/wiki/Installing-Neovim) Required version 0.4.2 or greater

## Features

* Almost fully feature-complete VIM integration by utilizing neovim
* First-class VSCode insert mode. The plugin unbinds self from the ```type``` event in the insert mode, so no typing lag and freezing anymore when long completion popup appears.
* Fully working VSCode features - autocompletion/go to definition/snippets/multiple cursors/etc...
* vimrc/vim plugins/etc are supported (few plugins don't make sense with vscode, such as nerdtree)

## Requirements

Neovim 0.4.2 or greater

* Set neovim path in the extension settings and you're good to go. **Important** you must specify full path to neovim, like ```C:\Neovim\bin\nvim.exe``` or ```/usr/local/bin/nvim```

## Important

* Visual modes are not producing real vscode selections (few versions had this feature previously, but it was implemented through ugly & hacky workarounds). Any vscode commands expecting selection won't work. But don't worry, you can workaround it by calling `call VSCodeNotifyRange("some-vscode-command", line1, line2)` from your vim/custom mapping. Likely you won't needed it all because code commenting/formatting/indenting for visual modes already works out of the box.
* The extenison for now works best if ```editor.scrollBeyondLastLine``` is disabled.
* When you type some commands they may be substituted for the another, like ```:write``` will be replaced by ```:Write```. This is normal.
* File/tab/window management (```:w```/```q```/etc...) commands are substituted and mapped to vscode actions. If you're using some custom commands/custom mappings to them, you might need to rebind them to call vscode actions instead. See reference links below for examples if you want to use custom keybindngs/commands. **DO NOT** use vim ```:w```, etc... in scripts/keybindings, they won't work.
* It's good idea to backup and move your init.vim file and start with new one until #25 is done
* It's better to use spaces instead of tabs for file indent. `<C-v>` is broken for tab indents

## VSCode specific features and differences

* O, o keys mapped to vscode ```editor.action.insertLineBefore/insertLineAfter``` command thus dont support count prefix
* =, == are mapped to ```editor.action.formatSelection```
* It's possible to call vscode commands from neovim. See ```VSCodeCall/VSCodeNotify``` vim functions in ```vscode-neovim.vim``` file. ```VSCodeCall``` is blocking request, while ```VSCodeNotify``` is not
* Scrolling is done by VSCode side. ```<C-d>/<C-u>/etc...``` are slighly different
* File management commands such as ```e``` / ```w``` / ```q``` etc are mapped to corresponding vscode commands and behavior may be different (see below)
* ```gf```/```gd```/```<C-]``` are mapped to ```editor.action.revealDefinition``` (Shortcut ```F12```). also ```<C-]>``` works in vim helps files
* ```gF```/```gD``` are mapped to ```editor.action.peekDefinition``` (opens definition in peek)
* ```<C-w>gF```/```<C-w>gf```/```<C-w>gd``` are mapped to ```editor.action.revealDefinitionAside``` (original vim command - open new tab and go to the file under cursor, but vscode/vim window/tabs metaphors are completely different, so it's useful to do slighlty different thing here)

## Enabling jj or jk as escape keys from the insert mode

Put into your keybindings.json:

for `jj`

```json
    {
        "command": "vscode-neovim.compositeEscape1",
        "key": "j",
        "when": "neovim.mode == insert",
        "args": "j"
    }
```

to enable `jk` add also:
```json
    {
        "command": "vscode-neovim.compositeEscape2",
        "key": "k",
        "when": "neovim.mode == insert",
        "args": "k"
    }
```

## Determining if running in vscode in your init.vim

This should do the trick:
```vim
if exists('g:vscode')
    " VSCode extension
else
    " ordinary neovim
endif
```

## Jumplist

Jumplist lifetime is mapped to vscode's view column lifetime and not persisted between restarts. Also jumplist is not inherited for ```split```/etc... commands

## Wildmenu completion

Command menu has the wildmenu completion on type. The completion options appear after 1.5s (to not bother you when you write ```:w``` or ```:noh```). ```<C-n>/<C-p>``` selects the option and ```<Tab>``` accepts it. See the gif:

![wildmenu](/images/wildmenu.gif)

## Multiple cursors

Multiple cursors work in:
1. Insert mode
2. (Optional) Visual line mode
3. (Optional) Visual block mode

To spawn multiple cursors from visual line/block modes type `ma`/`mA` or `mi`/`mI` (by default). The effect differs:
* For visual line mode `mi` will start insert mode on each selected line on the first non whitespace characeter and `ma` will on the end of line
* For visual block mode `mi` will start insert on each selected line before the cursor block and `ma` after
* `mA`/`mI` versions account empty lines too (only for visual line mode, for visual block mode they're same as ma/mi)

See gif in action:

![multicursors](/images/multicursor.gif)

## Custom keymaps for scrolling/window/tab/etc... management

* See [vscode-scrolling.vim](/vim/vscode-scrolling.vim) for scrolling commands reference
* See [vscode-file-commands.vim](/vim/vscode-file-commands.vim) for file commands reference
* See [vscode-tab-commands.vim](/vim/vscode-tab-commands.vim) for tab commands reference
* See [vscode-window-commands.vim](/vim/vscode-window-commands.vim) for window commands reference


## File/Tab management commands

```:e[dit]``` or ```ex```
* ```:e``` without argument and without bang (```!```) - opens quickopen window
* ```:e!``` without argument and with bang - opens open file dialog
* ```:e [filename]``` , e.g. ```:e $MYVIMRC``` - opens a file in new tab. The file must exist
* ```:e! [filename]```, e.g. ```:e! $MYVIMRC``` - closes current file (discard any changes) and opens a file. The file must exist

```ene[w]```
* ```enew``` Creates new untitled document in vscode
* ```enew!``` closes current file (discard any changes) and creates new untitled document

```fin[d]```
* Opens vscode's quick open window. Arguments and count are not supported

```w[rite]```
* Without bang (```!```) saves current file
* With bang opens 'save as' dialog

```sav[eas]```
* Opens 'save as' dialog

```wa[ll]```
* Saves all files. Bang is not doing anything

```q[uit]``` or keys ```<C-w> q``` / ```<C-w> c```
* Closes the active editor

```wq```
* Saves and closes the active editor

```qa[ll]```
* Closes all editors, but doesn't quit vscode. Acts like ```qall!```, so beware for a nonsaved changes

```wqa[ll]```/```xa[ll]```
* Saves all editors & close

```tabe[dit]```
* Similar to ```e[dit]```. Without argument opens quickopen, with argument opens the file in new tab

```tabnew```
* Opens new untitled file

```tabf[ind]```
* Opens quickopen window

```tab```/```tabs```
* Not supported. Doesn't make sense with vscode

```tabc[lose]```
* Closes active editor (tab)

```tabo[nly]```
* Closes other tabs in vscode **group** (pane). This differs from vim where a `tab` is a like a new window, but doesn't make sense in vscode.

```tabn[ext]``` or key ```gt```
* Switches to next (or ```count``` tabs if argument is given) in the active vscode **group** (pane)

```tabp[revious]``` or key ```gT```
* Switches to previous (or ```count``` tabs if argument is given) in the active vscode **group** (pane)

```tabfir[st]```
* Switches to the first tab in the active editor group

```tabl[ast]```
* Switches to the last tab in the active edtior group

```tabm[ove]```
* Not supported yet

Keys ```ZZ``` and ```ZQ``` are bound to ```:wq``` and ```q!``` respectively

## Buffer/window management commands

*Note*: split size distribution is controlled by ```workbench.editor.splitSizing``` setting. By default it's `distribute`, which is mapped to vim's ```equalalways``` and ```eadirection = 'both'``` (default)

```sp[lit]``` or key ```<C-w> s```
* Split editor horizontally. When argument given opens the specified file in the argument, e.g ```:sp $MYVIMRC```. File must exist

```vs[plit]``` or key ```<C-w> v```
* Split editor vertically. When argument given opens the specified file in the argument. File must exist

```new``` or key ```<C-w> n```
* Like ```sp[lit]``` but creates new untitled file if no argument given

```vne[w]```
* Like ```vs[plit]``` but creates new untitled file if no argument given

```<C-w> ^```
* Not supported yet

```vert[ical]```/```lefta[bove]```/etc...
* Not supported yet

```on[ly]``` or key ```<C-w> o```
* Without bang (```!```) Merges all editor groups into the one. **Doesn't** close editors
* With bang closes all editors from all groups except current one

```<C-w> j/k/h/l```
* Focus group below/above/left/right

```<C-w> <C-j>/<C-i>/<C-h>/<C-l>```
* Move editor to group below/above/left/right. Vim doesn't have analogue mappings. **Note**: ```<C-w> <C-i>``` moves editor up. Logically it should be ```<C-w> <C-k>``` but vscode has many commands mapped to ```<C-k> [key]``` and doesn't allow to use ```<C-w> <C-k>``` without unbinding them first

```<C-w> r/R/x```
* Not supported use ```<C-w> <C-j>``` and similar to move editors

```<C-w> w``` or ```<C-w> <C-w>```
* Focus next group. The behavior may differ than in vim

```<C-w> W``` or ```<C-w> p```
* Focus previous group. The behavior may differ than in vim. ```<C-w> p``` is completely different than in vim

```<C-w> t```
* Focus first editor group (most top-left)

```<C-w> b```
* Focus last editor group (most bottom-right)

```<C-w> H/K/J/L```
* Not supported yet

```<C-w> =```
* Align all editors to have the same width

```[count]<C-w> >``` or ```[count]<C-w> +```
* Increase editor size by count. Both width & height are increased since in vscode it's not possible to control individual width/height

```[count]<C-w> <``` or ```[count]<C-w> -```
* Decrease editor size by count. Both width & height are increased since in vscode it's not possible to control individual width/height

```<C-w> _```
* Toggle maximized editor size. Pressing again will restore the size

## Insert mode special keys

Enabled by ```useCtrlKeysForInsertMode = true``` (default true)

Key | Desc | Status
--- | ---- | ------
```CTRL-r [0-9a-z"%#*+:.-=]``` | Paste from register | Works
```CTRL-a``` | Paste previous inserted content | Works
```CTRL-u``` | Delete all text till begining of line, if empty - delete newline | Bound to VSCode key
```CTRL-w``` | Delete word left | Bound to VSCode key
```CTRL-h``` | Delete character left | Bound to VSCode key
```CTRL-t``` | Indent lines right | Bound to VSCode indent line
```CTRL-d``` | Indent lines left | Bound to VSCode outindent line
```CTRL-j``` | Insert line | Bound to VSCode insert line after

Other keys are not supported in insert mode

## Normal mode control keys

Enabled by ```useCtrlKeysForNormalMode = true``` (default true)

Refer to vim manual to get help what they're doing

* CTRL-a
* CTRL-b
* CTRL-c
* CTRL-d
* CTRL-e
* CTRL-f
* CTRL-i
* CTRL-o
* CTRL-r
* CTRL-u
* CTRL-v
* CTRL-w
* CTRL-x
* CTRL-y
* CTRL-]
* CTRL-j
* CTRL-k
* CTRL-l
* CTRL-h
* CTRL-/

Other control keys are not being sent (Usually useless with vscode)

## Cmdline control keys (always enabled)

* CTRL-h (delete one character left)
* CTRL-w (delete word left)
* CTRL-u (clear line)
* CTRL-g / CTRL-t (in incsearch mode moves to next/previous result)
* CTRL-l (add next character under the cursor to incsearch)
* CTRL-n / CTRL-p (select next/previous wildmenu completion)
* Tab - Select suggestion

## Pass additional keys to neovim or disable existing ctrl keys mappings

### To pass additional ctrl key sequence, for example <C-Tab> add to your keybindings.json:

```json
    {
        "command": "vscode-neovim.send",
        "key": "ctrl+tab",
        "when": "editorTextFocus && neovim.mode != insert",
        "args": "<C-Tab>"
    }
```

### To disable existing ctrl key sequence, for example Ctrl+A add to your keybindings.json

```json
    {
        "command": "-vscode-neovim.send",
        "key": "ctrl+a"
    }
```


## Vim-easymotion

Speaking honestly, original [vim-easymotion](https://github.com/easymotion/vim-easymotion) works fine and as expected... except one thing: it really replaces your text with markers then restores back. It may work for VIM but for VS Code it leads to broken text and many errors reported while you're jumping. For this reason i created the special [vim-easymotion fork](https://github.com/asvetliakov/vim-easymotion) which doesn't touch your text and instead use vscode text decorations. Just add my fork to your ```vim-plug``` block or by using your favorite vim plugin installer and delete original vim-easymotion. Also overwin motions won't work (obviously) so don't use them. Happy jumping!

![easymotion](/images/easy-motion-vscode.png)

## Vim-commentary
You can use [vim-commentary](https://github.com/tpope/vim-commentary) if you like it. But vscode already has such functionality so why don't use it? Add to your init.vim/init.nvim

```
xmap gc  <Plug>VSCodeCommentary
nmap gc  <Plug>VSCodeCommentary
omap gc  <Plug>VSCodeCommentary
nmap gcc <Plug>VSCodeCommentaryLine
```

Similar to vim-commentary, gcc is comment line (accept count), use gc with motion/in visual mode. ```VSCodeCommentary``` is just a simple function which calls ```editor.action.commentLine```


## Known Issues

See [Issues section](https://github.com/asvetliakov/vscode-neovim/issues)

## How it works

* VScode connects to neovim instance
* When opening a some file, a scratch buffer is created in nvim and being init with text content from vscode
* Normal/visual mode commands are being sent directly to neovim. The extension listens for buffer events and applies edits from neovim
* When entering the insert mode, the extensions stops listen for keystroke events and delegates typing mode to vscode (no neovim communication is being performed here)
* After pressing escape key from the insert mode, extension sends changes obtained from the insert mode to neovim

## Credits & External Resources
* [vim-altercmd](https://github.com/kana/vim-altercmd) - Used for rebinding default commands to call vscode command
* [neovim nodejs client](https://github.com/neovim/node-client) - NodeJS library for communicating with Neovim
