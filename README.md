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

- [🧰 Getting Started](#-getting-started)
  - [Installation](#installation)
  - [Neovim configuration](#neovim-configuration)
  - [VSCode configuration](#vscode-configuration)
  - [Custom keybindings](#custom-keybindings)
  - [VSCode specific differences](#vscode-specific-differences)
- [💡 Tips, Features, Bindings, and Troubleshooting](#-tips-features-bindings-and-troubleshooting)
- [🔧 Build](#-build)
- [📑 How it works](#-how-it-works)
- [❤️ Credits & External Resources](#️-credits--external-resources)

</details>

## 🧰 Getting Started

### Installation

-   Install the [vscode-neovim](https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim)
    extension.
-   Install [Neovim](https://github.com/neovim/neovim/wiki/Installing-Neovim) **0.5.0** or greater.
    -   Set the neovim path in the extension settings. You must specify full path to neovim, like
        "`C:\Neovim\bin\nvim.exe"` or "`/usr/local/bin/nvim`".
    -   The setting id is "`vscode-neovim.neovimExecutablePaths.win32/linux/darwin`", respective to your system.
-   If you want to use neovim from WSL, set the `useWSL` configuration toggle and specify linux path to nvim binary.
    `wsl.exe` windows binary and `wslpath` linux binary are required for this. `wslpath` must be available through
    `$PATH` linux env setting. Use `wsl --list` to check for the correct default linux distribution.

### Neovim configuration

Since many vim plugins can cause issues in vscode, it is recommended to start from an empty `init.vim`. For a guide for
which types of plugins are supported, see
[this](https://github.com/vscode-neovim/vscode-neovim/wiki/tips#performance-problems)

Before creating an issue on github, make sure you can reproduce the problem with an empty `init.vim` and no vscode
extensions.

To determine if neovim is running in vscode, add to your `init.vim`:

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

See [plugins](plugins) in the wiki for tips on configuring vim plugins.

### VSCode configuration

See [tips](https://github.com/vscode-neovim/vscode-neovim/wiki/tips) in the wiki for information regarding recommended
VSCode configuration.

See [bindings](https://github.com/vscode-neovim/vscode-neovim/wiki/bindings) in the wiki for a list of default VSCode
bindings and commands.

-   The extension works best if `editor.scrollBeyondLastLine` is disabled.
-   To have the explorer keybindings work, you will need to set `"workbench.list.automaticKeyboardNavigation": false`.
    Note that this will disable the filtering in the explorer that occurs when you usually start typing.
-   On a Mac, the <kbd>h</kbd>, <kbd>j</kbd>, <kbd>k</kbd> and <kbd>l</kbd> movement keys may not repeat when held, to
    fix this open Terminal and execute the following command:
    `defaults write com.microsoft.VSCode ApplePressAndHoldEnabled -bool false`.

### Custom keybindings

Every keyboard shortcut that gets sent to neovim must be explicitly defined in vscode. By default, only bindings that
are included by neovim by default are sent.

To pass custom bindings to neovim, for example <kbd>C-h</kbd> in normal mode, add to your keybindings.json:

```jsonc
{
    "command": "vscode-neovim.send",
    // the key sequence to activate the binding
    "key": "ctrl+h",
    // don't activate during insert mode
    "when": "editorTextFocus && neovim.mode != insert",
    // the input to send to neovim
    "args": "<C-h>"
}
```

To disable an existing shortcut, for example <kbd>C-a</kbd>, add to your keybindings.json:

```json
{
    "command": "-vscode-neovim.send",
    "key": "ctrl+a"
}
```

The vscode keybindings editor provides a good way to delete keybindings.

### VSCode specific differences

-   File and editor management commands such as `:e`/`:w`/`:q`/`:vsplit`/`:tabnext`/etc are mapped to corresponding
    vscode commands and behaviour may be different
    ([see below](https://github.com/vscode-neovim/vscode-neovim/wiki/bindings)). **Do not** use vim commands like `:w`
    in scripts/keybindings, they won't work. If you're using them in some custom commands/mappings, you might need to
    rebind them to call vscode commands from neovim with `VSCodeCall/VSCodeNotify`
    ([see below](https://github.com/vscode-neovim/vscode-neovim/wiki/Tips#invoking-vscode-actions-from-neovim)).
-   Visual modes don't produce vscode selections, so any vscode commands expecting selection won't work. To round the
    corners, invoking the VSCode command picker from visual mode through the default hotkeys
    (<kbd>f1</kbd>/<kbd>ctrl/cmd+shift+p</kbd>) converts vim selection to real vscode selection. This conversion is also
    done automatically for some commands like commenting and formatting. If you're using some custom mapping for calling
    vscode commands that depends on real vscode selection, you can use
    `VSCodeNotifyRange`/`VSCodeNotifyRangePos`/`VSCodeNotifyVisual` (linewise, characterwise, and automatic) which will
    convert vim visual mode selection to vscode selection before calling the command
    ([see below](https://github.com/vscode-neovim/vscode-neovim/wiki/Tips#invoking-vscode-actions-from-neovim)).
-   When you type some commands they may be substituted for the another, like `:write` will be replaced by `:Write`.
-   Scrolling is done by VSCode. <kbd>C-d</kbd>/<kbd>C-u</kbd>/etc are slightly different.
-   Editor customization (relative line number, scrolloff, etc) is handled by VSCode.
-   Dot-repeat (<kbd>.</kbd>) is slightly different - moving the cursor within a change range won't break the repeat.
    sequence. In neovim, if you type `abc<cursor>` in insert mode, then move cursor to `a<cursor>bc` and type `1` here
    the repeat sequence would be `1`. However in vscode it would be `a1bc`. Another difference is that when you delete
    some text in insert mode, dot repeat only works from right-to-left, meaning it will treat <kbd>Del</kbd> key as
    <kbd>BS</kbd> keys when running dot repeat.

## 💡 Tips, Features, Bindings, and Troubleshooting

Refer to the [wiki](https://github.com/vscode-neovim/vscode-neovim/wiki).

## 🔧 Build

How to build (and install) from source:

1. Clone the repo locally.

    ```
    git clone https://github.com/vscode-neovim/vscode-neovim
    ```

2. Install the dependencies.

    ```
    yarn install
    ```

3. Build the VSIX package:

    ```
    ./node_modules/.bin/yarn run vsce package -o vscode-neovim.vsix
    ```

4. From vscode, use the `Extensions: Install from VSIX` command to install the package.

How to develop:

1. Open the repo in VSCode
2. Go to debug view and click `Run Extension` (F5)

How to run tests:

1. Open the repo in VSCode
2. Go to debug view and click `Extension Tests` (F5)
3. To run individual tests, modify `grep: ".*"` in `src/test/suite/index.ts`

## 📑 How it works

-   VScode connects to neovim instance
-   When opening a file, a scratch buffer is created in nvim and being init with text content from vscode
-   Normal/visual mode commands are being sent directly to neovim. The extension listens for buffer events and applies
    edits from neovim
-   When entering the insert mode, the extensions stops listen for keystroke events and delegates typing mode to vscode
    (no neovim communication is being performed here)
-   After pressing escape key from the insert mode, extension sends changes obtained from the insert mode to neovim

## ❤️ Credits & External Resources

-   [vim-altercmd](https://github.com/kana/vim-altercmd) - Used for rebinding default commands to call vscode command
-   [neovim nodejs client](https://github.com/neovim/node-client) - NodeJS library for communicating with Neovim
-   [VSCodeVim](https://github.com/VSCodeVim/Vim) - Used for various inspiration
