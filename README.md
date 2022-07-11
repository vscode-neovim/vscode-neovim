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

## 🧰 Getting Started

Refer to [getting started](https://github.com/vscode-neovim/vscode-neovim/wiki/getting-started) in the wiki.

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
