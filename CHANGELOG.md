# Change Log

## [0.0.24]

- File management commands, like ```:w``` or ```:q``` (bound to vscode actions)

## [0.0.1-0.0.23]

- A bunch of development versions. 0.0.23 has the following features
- Correct editing and the cursor management
- Control keys in the insert & normal/visual modes
- Visual mode produces vscode selections
- Working VIM highlighting (most of a default VIM HL groups are ignored since they don't make sense in VSCode, but non standard groups are processed, so things like vim-easymotion or vim-highlight are working fine)
- Scrolling commands (scrolling is done by vscode so things are slighly different here)
- Special vim-easymotion fork to use vscode text decorators instead of replacing text (as original vim-easymotion does)
- Analogue of vim-commentary (original vim-commentary works fine too)
- Working external vim buffers, like ```:help``` or ```:PlugStatus```
- Multiple cursors for visual line/visual block modes


## [0.0.1]

- Initial release