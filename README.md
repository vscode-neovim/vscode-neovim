# vscode-neovim

# Disclaimer

Although it's more-less working, this is VERY experimental plugin and WIP. Use at your own **risk!**

## Features

* Almost fully feature-complete VIM integration by utilizing neovim
* First-class VSCode insert mode. The plugin unbinds self from ```type``` event in insert mode, so no typing lag anymore. Neovim is not used for the insert mode.

## Requirements

Neovim 0.4.2 or greater

* Set neovim path in the extension settings and you're good to go
* Bind your favorite escape key to ```vscode-neovim.escape``` command. Default ```Ctrl+C```

## Important

* **DO NOT** use vim buffers, tab or window management. The plugin assumes that these tasks will be performed by VSCode side. Later i'll rebind ```:vsplit``` commands and such to call vscode commands instead
* Almost all Ctrl keys are missing and not being sent to vim/are used in the input mode. This will be fixed in a coming days
* The extension works by creating scratch buffers in neovim. Use save command from vs code. again, later ```:w``` will be rebinded to vscode built-in save command


## Known Issues

Many for now...
