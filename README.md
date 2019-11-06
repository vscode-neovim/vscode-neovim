# vscode-neovim

# Disclaimer

This is WIP extension. Use with caution!

## Installation

* Install [vscode-neovim](https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim) extension
* Install [Neovim](https://github.com/neovim/neovim/wiki/Installing-Neovim) Required version 0.4.2 or greater

## Features

* Almost fully feature-complete VIM integration by utilizing neovim
* First-class VSCode insert mode. The plugin unbinds self from ```type``` event in insert mode, so no typing lag anymore. Neovim is not used for the insert mode.

## Requirements

Neovim 0.4.2 or greater

* Set neovim path in the extension settings and you're good to go
* Bind your favorite escape key to ```vscode-neovim.escape``` command. Default ```Ctrl+C```

## VSCode specific features and differences

* Multiple vscode cursors work in the insert mode. Visual block (Ctrl-v) mode also spawns multiple cursors. It's also possible to spawn multiple cursors with visual line mode, but i don't know yet if it will be much useful
* O, o keys mapped to vscode ```editor.action.insertLineBefore/insertLineAfter``` command thus doesn't support <count> prefix
* Visual modes produce VSCode selections. By design
* After deleting some text in visual mode the cursor position may be slightly different than in vim. see #20
* It's possible to call vscode commands from neovim. See ```VSCodeCall/VSCodeNotify``` vim functions in ```vscode-neovim.vim``` file. ```VSCodeCall``` is blocking request, while ```VSCodeNotify``` is not
* Mouse scrolling is not supported yet


## Important

* **DO NOT** use vim buffers, tab or window management. The plugin assumes that these tasks will be performed by VSCode side. Later i'll rebind ```:vsplit``` commands and such to call vscode commands instead
* Almost all Ctrl keys are missing and not being sent to vim/are used in the input mode. This will be fixed in a coming days
* The extension works by creating scratch buffers in neovim. Use save command from vs code. again, later ```:w``` will be rebinded to vscode built-in save command


## Known Issues

See [Issues section](https://github.com/asvetliakov/vscode-neovim/issues)

## How it works

* VScode connectes to nvim instance
* When opening a some file, a scratch buffer is created in nvim and being init with initial text content
* Normal/visual mode commands are being sent directly to neovim. The extension listens for buffer events and applies edits from neovim
* When entering the insert mode, the extensions stops listen for keystroke events and delegates typing mode to vscode (no neovim communication is being performed here)
* After pressing escape key from the insert mode, extension sends changes stored from the insert mode to neovim
* Scrolling is owned by vscode side
