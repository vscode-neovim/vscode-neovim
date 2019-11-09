# vscode-neovim

# Disclaimer

This is WIP extension. Use with caution!

## Installation

* Install [vscode-neovim](https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim) extension
* Install [Neovim](https://github.com/neovim/neovim/wiki/Installing-Neovim) Required version 0.4.2 or greater

## Features

* Almost fully feature-complete VIM integration by utilizing neovim
* First-class VSCode insert mode. The plugin unbounds self from ```type``` event in the insert mode, so no typing lag anymore.

## Requirements

Neovim 0.4.2 or greater

* Set neovim path in the extension settings and you're good to go
* Bind your favorite escape key to ```vscode-neovim.escape``` command. Default ```Ctrl+C```

## VSCode specific features and differences

* Multiple vscode cursors work in the insert mode.
* O, o keys mapped to vscode ```editor.action.insertLineBefore/insertLineAfter``` command thus dont support count prefix
* Visual modes don't produce real vscode selections right now
* After deleting some text in visual mode the cursor position may be slightly different than in vim
* It's possible to call vscode commands from neovim. See ```VSCodeCall/VSCodeNotify``` vim functions in ```vscode-neovim.vim``` file. ```VSCodeCall``` is blocking request, while ```VSCodeNotify``` is not


## Important

* **TURN OFF** ```editor.scrollBeyondLastLine```. Or don't turn and get funky behavior when trying to scroll by mouse over last line

* **DO NOT** use vim buffers, tab or window management. The plugin assumes that these tasks will be performed by VSCode side. Later i'll rebind ```:vsplit``` commands and such to call vscode commands instead
* Almost all Ctrl keys are missing and not being sent to vim/are used in the input mode. This will be fixed in a coming days
* The extension works by creating scratch buffers in neovim. Use save command from vs code. again, later ```:w``` will be rebound to vscode built-in save command


## Insert mode special keys

Enabled by ```useCtrlKeysForInsertMode = true``` (default true)

Key | Desc | Status
--- | ---- | ------
```CTRL-r [0-9,a-z,"%#*+:.-=]``` | Paste from register | Works, simulated
```CTRL-a``` | Paste previous inserted content | Works, simulated
```CTRL-u``` | Delete all text till begining of line, if empty - delete newline | Bound to VSCode key
```CTRL-w``` | Delete word left | Bound to VSCode key
```CTRL-h``` | Delete character left | Bound to VSCode key
```CTRL-t``` | Indent lines right | Bound to VSCode indent line
```CTRL-d``` | Indent lines left | Bound to VSCode outindent line
```CTRL-j``` | Insert line | Bound to VSCode insert line after
```Esc```, ```CTRL-[```, ```CTRL-c``` | Escape insert mode | Use configured escape key (send as ```Esc``` to vim)
```CTRL-@``` | Insert previously inserted content and exit insert | Not supported
```CTRL-i``` | Insert tab | Not supported. Same as ```<Tab>```
```CTRL-m``` | Insert new line | Not supported. Same as ```Enter``` or ```CTRL-j```
```CTRK-k``` | Enter digrpah | Not supported
```CTRL-n/CTRL-p``` | Find next/prev keyword | Not supported
```CTRL-r CTRL-r [reg]```, ```CTRL-r CTRL-0 [reg]```, ```CTRL-r CTRL-p [reg]``` | Additional paste from register keys | Not supported
```0 CTRL-d``` | Delete all indent | Not supported
```^ CTRL-d``` | Delete all indent & restore indent at next line | Not supported
```CTRL-v/CTRL-q``` | Insert next non-digit literally | Not supported
```CTRL-x``` | Enter Ctrl-x mode | Not supported
```CTRL-e``` | Insert the character which is below the cursor | Not supported
```CTRL-y``` | Insert the character which is above the cursor | Not supported
```CTRL-_``` | Switch between languages | Not supported
```CTRL-^``` | Toggle the use of typing language characters | Not supported
```CTRL-]``` | Trigger abbreviation, without inserting a character | Not supported
```Insert``` | Toggle between Insert and Replace mode | Not supported



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
