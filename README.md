# Neo Vim (VS Code Neovim)

Neovim integration for Visual Studio Code

# Disclaimer

This is WIP extension. Use with caution!

## Installation

* Install [vscode-neovim](https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim) extension
* Install [Neovim](https://github.com/neovim/neovim/wiki/Installing-Neovim) Required version 0.4.2 or greater

## Features

* Almost fully feature-complete VIM integration by utilizing neovim
* First-class VSCode insert mode. The plugin unbinds self from ```type``` event in the insert mode, so no typing lag anymore.
* Fully working VSCode features - autocompletion/go to definition/snippets/multiple cursors/etc...

## Requirements

Neovim 0.4.2 or greater

* Set neovim path in the extension settings and you're good to go
* Bind your favorite escape key to ```vscode-neovim.escape``` command. Default ```Ctrl+C```

## Important

* The extenison for now works best if ```editor.scrollBeyondLastLine``` is disabled.

## VSCode specific features and differences

* O, o keys mapped to vscode ```editor.action.insertLineBefore/insertLineAfter``` command thus dont support count prefix
* =, == are mapped to ```editor.action.formatSelection```
* It's possible to call vscode commands from neovim. See ```VSCodeCall/VSCodeNotify``` vim functions in ```vscode-neovim.vim``` file. ```VSCodeCall``` is blocking request, while ```VSCodeNotify``` is not
* Scrolling is done by VSCode side. ```<C-d>/<C-u>/etc...``` are slighly different
* Jumplist is mapped to VSCode's ```navigateBack/navigateForward``` commands.
* File management commands such as ```e``` / ```w``` / ```q``` etc are mapped to corresponding vscode commands and behavior may different (see below)


## Multiple cursors

Multiple cursors work in:
1. Insert mode
2. Visual line mode
3. Visual block mode

Both visual lines and visual block modes spawn multiple cursors for you. You can switch to insert mode by pressing ```I``` or ```A``` keys. The effect differs:
* For visual line mode ```I``` will start insert mode on each selected line on the first non whitespace characeter and ```A``` will on the end of line
* For visual block mode ```I``` will start insert on each selected line before the cursor block and ```A``` after

See gif in action:

![multicursors](/images/multicursor.gif)

* **DO NOT** use vim buffers, tab or window management. The plugin assumes that these tasks will be performed by VSCode side. Later i'll rebind ```:vsplit``` commands and such to call vscode commands instead
* The extension works by creating scratch buffers in neovim. Use save command from vs code. again, later ```:w``` will be rebound to vscode built-in save command


## File management commands

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

Other control keys are not being sent (Usually useless with vscode)


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
