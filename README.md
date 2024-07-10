<h2 align="center"><img src="./images/icon.png" height="128"><br>VSCode Neovim</h2>
<p align="center"><strong>VSCode Neovim Integration</strong></p>

<p align=center>
<a href="https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim"><img src="https://img.shields.io/visual-studio-marketplace/v/asvetliakov.vscode-neovim?color=%234c1&label=Visual%20Studio%20Marketplace"></a>
<a href="https://github.com/asvetliakov/vscode-neovim/actions/workflows/build_test.yml"><img src="https://github.com/asvetliakov/vscode-neovim/workflows/Code%20Check%20&%20Test/badge.svg"></a>
<a href="https://gitter.im/vscode-neovim/community?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge"><img src="https://badges.gitter.im/vscode-neovim/community.svg"></a>
</p>

[Neovim](https://neovim.io/) is a fork of Vim to allow greater extensibility and integration. This extension uses a
fully embedded Neovim instance, no more half-complete Vim emulation! VSCode's native functionality is used for insert
mode and editor commands, making the best use of both editors.

-   🎉 Almost fully feature-complete Vim integration by utilizing Neovim as a backend.
-   🔧 Supports custom `init.vim` and many Vim plugins.
-   🥇 First-class and lag-free insert mode, letting VSCode do what it does best.
-   🤝 Complete integration with VSCode features (lsp/autocompletion/snippets/multi-cursor/etc).

<strong>Table of Contents</strong>

-   [🧰 Getting Started](#-getting-started)
    -   [Installation](#installation)
    -   [Neovim configuration](#neovim-configuration)
    -   [VSCode Settings \& Commands](#vscode-settings--commands)
-   [💡 Tips and Features](#-tips-and-features)
    -   [VSCode specific differences](#vscode-specific-differences)
    -   [Troubleshooting](#troubleshooting)
    -   [Performance](#performance)
    -   [Composite escape keys](#composite-escape-keys)
    -   [Jumplist](#jumplist)
    -   [Multiple cursors](#multiple-cursors)
    -   [Remote development](#remote-development)
-   [⚡️ API](#️-api)
    -   [vscode.action(name, opts)](#vscodeactionname-opts)
    -   [vscode.call(name, opts, timeout)](#vscodecallname-opts-timeout)
    -   [vscode.on(event, callback)](#vscodeonevent-callback)
    -   [vscode.has_config(name)](#vscodehas_configname)
    -   [vscode.get_config(name)](#vscodeget_configname)
    -   [vscode.update_config(name, value, target)](#vscodeupdate_configname-value-target)
    -   [vscode.notify(msg)](#vscodenotifymsg)
    -   [vscode.eval(code\[, opts, timeout\])](#vscodeevalcode-opts-timeout)
    -   [vscode.eval_async(code\[, opts\])](#vscodeeval_asynccode-opts)
    -   [vscode.with_insert(callback)](#vscodewith_insertcallback)
    -   [Builtin module overrides](#builtin-module-overrides)
    -   [VimScript](#vimscript)
-   [⌨️ Keybindings (shortcuts)](#️-keybindings-shortcuts)
    -   [Keybinding Passthroughs](#keybinding-passthroughs)
        -   [Insert mode control keys passthrough](#insert-mode-control-keys-passthrough)
        -   [Normal mode control keys passthrough](#normal-mode-control-keys-passthrough)
        -   [Cmdline mode special keys passthrough](#cmdline-mode-special-keys-passthrough)
        -   [Disable passthrough for certain filetypes](#disable-passthrough-for-certain-filetypes)
        -   [Remove other vscode or passthrough keybindings](#remove-other-vscode-or-passthrough-keybindings)
    -   [Code navigation bindings](#code-navigation-bindings)
    -   [Explorer/list navigation bindings](#explorerlist-navigation-bindings)
    -   [Explorer file manipulation bindings](#explorer-file-manipulation-bindings)
    -   [Hover widget manipulation bindings](#hover-widget-manipulation-bindings)
-   [📟 Neovim Commands](#-neovim-commands)
    -   [File management](#file-management)
    -   [Tab management](#tab-management)
    -   [Buffer/window management](#bufferwindow-management)
-   [🎨 Highlights](#-highlights)
-   [🧰 Developing](#-developing)
-   [❤️ Credits \& External Resources](#️-credits--external-resources)

## 🧰 Getting Started

### Installation

Install the [vscode-neovim](https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim) extension.

Install [Neovim](https://github.com/neovim/neovim/wiki/Installing-Neovim) **0.9.0** or greater (0.10 recommended).

> **Note:** Though the extension strives to be as compatible as possible with older versions of Neovim, some older
> versions may have quirks that are not present anymore. In light of this, certain configuration settings are
> recommended in some older versions for the best experience. These can be found
> [on the wiki](https://github.com/vscode-neovim/vscode-neovim/wiki/Version-Compatibility-Notes).

\[Optional\] Set the Neovim path in the extension settings under
"`vscode-neovim.neovimExecutablePaths.win32/linux/darwin`", respective to your system. For example,
"`C:\Neovim\bin\nvim.exe`" or "`/usr/local/bin/nvim`".

> **Note:** If you want to use Neovim from WSL, set the `useWSL` configuration toggle and specify the Linux path to the
> nvim binary. `wsl.exe` Windows binary and `wslpath` Linux binary are required for this. `wslpath` must be available
> through `$PATH` Linux env setting. Use `wsl --list` to check for the correct default Linux distribution.

### Neovim configuration

Since many Vim plugins can cause issues in VSCode, it is recommended to start from an empty `init.vim`. For a guide for
which types of plugins are supported, see [troubleshooting](#troubleshooting).

Before creating an issue on Github, make sure you can reproduce the problem with an empty `init.vim` and no VSCode
extensions.

To determine if Neovim is running in VSCode, add to your `init.vim`:

```vim
if exists('g:vscode')
    " VSCode extension
else
    " ordinary Neovim
endif
```

In lua:

```lua
if vim.g.vscode then
    -- VSCode extension
else
    -- ordinary Neovim
end
```

To conditionally activate plugins, the best solution is to use the
[LazyVim VSCode extra](https://www.lazyvim.org/extras/vscode). However, `packer.nvim` and `lazy.nvim` have built-in
support for `cond = vim.g.vscode` and `vim-plug` has a
[few solutions](https://github.com/junegunn/vim-plug/wiki/tips#conditional-activation). See
[plugins](https://github.com/vscode-neovim/vscode-neovim/wiki/Plugins) in the wiki for tips on configuring Vim plugins.

### VSCode Settings & Commands

Open the [vscode-neovim](vscode:extension/asvetliakov.vscode-neovim) extension details in VSCode, and check all
available [settings](https://code.visualstudio.com/docs/getstarted/settings) and commands in the Features tab.

## 💡 Tips and Features

### VSCode specific differences

-   File and editor management commands such as `:e`/`:q`/`:vsplit`/`:tabnext`/etc are mapped to corresponding VSCode
    commands and behavior may be different ([see below](#%EF%B8%8F--keybindings-shortcuts)).
    -   **Do not** use vim commands like `:e` in scripts/keybindings, they won't work. If you're using them in some
        custom commands/mappings, you might need to rebind them to call VSCode commands from Neovim with
        `require('vscode').call()` (see [API](#%EF%B8%8F-api)).
    -   Since version 1.18.0, `:w`, `:wa` and `:sav` commands are supported and no longer alias to VSCode commands. You
        can use them as you would in Neovim.
-   When you type some commands they may be substituted for another, check
    [AlterCommand](https://github.com/search?q=repo%3Avscode-neovim%2Fvscode-neovim%20AlterCommand&type=code) for the
    list of substitutions.
-   Scrolling is done by VSCode. <kbd>C-d</kbd>/<kbd>C-u</kbd>/etc are slightly different.
-   Editor customization (relative line number, scrolloff, etc) is handled by VSCode.
-   Dot-repeat (<kbd>.</kbd>) is slightly different - moving the cursor within a change range won't break the repeat.
    sequence. In Neovim, if you type `abc<cursor>` in insert mode, then move the cursor to `a<cursor>bc` and type `1`
    here the repeat sequence would be `1`. However, in VSCode, it would be `a1bc`. Another difference is that when you
    delete some text in insert mode, dot repeat only works from right to left, meaning it will treat <kbd>Del</kbd> key
    as <kbd>BS</kbd> keys when running dot repeat.

### Troubleshooting

-   View the logs via `Output: Focus on Output View` and select `vscode-neovim`.
-   Enable `vscode-neovim.neovimClean` in VSCode settings, which starts Nvim _without_ your plugins (`nvim --clean`).
    Nvim plugins can do _anything_. Visual effects in particular can cause visual artifacts. vscode-neovim does its best
    to merge the visual effects of Nvim and VSCode, but it's far from perfect. You may need to disable some Nvim plugins
    that cause visual effects.
-   If you encounter rendering issues (visual artifacts), try <kbd>CTRL-L</kbd> to force Nvim to redraw.
-   If you get the `Unable to init vscode-neovim: command 'type' already exists` message, uninstall other VSCode
    extensions that use `registerTextEditorCommand("type", …)` (like
    [VSCodeVim](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim) or
    [Overtype](https://marketplace.visualstudio.com/items?itemName=adammaras.overtype)).
-   On a Mac, the <kbd>h</kbd>, <kbd>j</kbd>, <kbd>k</kbd> and <kbd>l</kbd> movement keys may not repeat when held, to
    fix this open Terminal and execute the following command:
    `defaults write com.microsoft.VSCode ApplePressAndHoldEnabled -bool false`.
-   To fix the remapped escape key not working in Linux, set `"keyboard.dispatch": "keyCode"`.

### Performance

If you have any performance problems (cursor jitter usually) make sure you're not using vim plugins that increase
latency and cause performance problems.

Make sure to disable unneeded plugins, as many of them don't make sense with VSCode. Specifically, you don't need any
code highlighting, completion, LSP plugins, or plugins that spawn windows/buffers (nerdtree , fuzzy-finders, etc). Most
navigation/textobject/editing plugins should be fine.

For example, make sure you're not using anything that renders decorators very often:

-   Line number extensions (VSCode has built-in support for normal/relative line numbers)
-   Indent guide extensions (VSCode has built-in indent guides)
-   Brackets highlighter extensions (VSCode has built-in feature)

> If you're not sure, disable all other extensions, **reload VSCode window**, and see if the problem persists before
> reporting it.

### Composite escape keys

Set with `compositeKeys` and tweak with `compositeTimeout`.

Examples: add to your `settings.json`:

<kbd>jj</kbd> to escape

```jsonc
{
    "vscode-neovim.compositeKeys": {
        "jj": {
            "command": "vscode-neovim.escape",
        },
    },
}
```

<kbd>jk</kbd> to escape and save

```jsonc
{
    "vscode-neovim.compositeKeys": {
        "jk": {
            // Use lua to execute any logic
            "command": "vscode-neovim.lua",
            "args": [
                [
                    "local code = require('vscode')",
                    "code.action('vscode-neovim.escape')",
                    "code.action('workbench.action.files.save')",
                ],
            ],
        },
    },
}
```

### Jumplist

VSCode's jumplist is used instead of Neovim's. This is to make VSCode native navigation (mouse click, jump to
definition, etc) navigable through the jumplist.

Make sure to bind to `workbench.action.navigateBack` / `workbench.action.navigateForward` if you're using custom
mappings. Marks (both upper & lowercased) should work fine.

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

![multicursor](https://github.com/vscode-neovim/vscode-neovim/assets/47070852/72b3f2b3-6d80-4ace-b6f4-b211baad74d1)

> **Note**: The built-in multi-cursor support may not meet your needs. Please refer to the plugin
> [vscode-multi-cursor.nvim](https://github.com/vscode-neovim/vscode-multi-cursor.nvim) for more multi-cursor features

### Remote development

We intend to use vscode-neovim as a UI extension, so when you're using remote development, vscode-neovim is enabled in
the Local Extension Host, and it should work out of the box.

If you prefer to use the remote environment's copy of Neovim, rather than the locally installed one, vscode-neovim
should be installed in the Remote Extension Host. You can set the following in your VSCode `settings.json`:

```json
{
    "remote.extensionKind": {
        "asvetliakov.vscode-neovim": ["workspace"]
    }
}
```

> **Note**: You will need to install neovim in the remote environment.

For more information:

-   [Remote Development](https://code.visualstudio.com/docs/remote/remote-overview)
-   [Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)
-   [Remote Extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions)

## ⚡️ API

Load the module:

```lua
local vscode = require('vscode')
```

<!-- prettier-ignore-start -->
> [!TIP]
> The previously used module named "vscode-neovim" is now deprecated, so don't be confused if "vscode-neovim" is used in old discussions or other resources.
<!-- prettier-ignore-end -->

1. `vscode.action()`: asynchronously executes a vscode command.
2. `vscode.call()`: synchronously executes a vscode command.
3. `vscode.on()`: defines a handler for some Nvim UI events.
4. `vscode.has_config()`: checks if a vscode setting exists.
5. `vscode.get_config()`: gets a vscode setting value.
6. `vscode.update_config()`: sets a vscode setting.
7. `vscode.notify()`: shows a vscode message (see also Nvim's `vim.notify`).
8. `vscode.to_op()`: A helper for `map-operator`. See [code_actions.lua](./runtime/modules/code_actions.lua) for the
   usage
9. `g:vscode_clipboard`: Clipboard provider using VSCode's clipboard API. Used by default when in WSL. See
   `:h g:clipboard` for more details. Usage: `vim.g.clipboard = vim.g.vscode_clipboard`
10. `vscode.eval()`: evaluate javascript synchronously in vscode and return the result
11. `vscode.eval_async()`: evaluate javascript asynchronously in vscode
12. `vscode.with_insert()`: perform operations in insert mode.

### vscode.action(name, opts)

Asynchronously executes a vscode command.

Parameters:

-   `name` (string): The name of the action, generally a vscode command.
-   `opts` (table): Map of optional parameters:
    -   `args` (table): List of arguments passed to the vscode command. If the command only requires a single object
        parameter, you can directly pass in a map-like table.
        -   Examples:
            -   `action('foo', { args = { 'foo', 'bar', … } })`
            -   `action('foo', { args = { foo = bar, … } })`
    -   `range` (table): Specific range for the action. Implicitly passed in visual mode. Has three possible forms (all
        values are 0-indexed):
        -   `[start_line, end_line]`
        -   `[start_line, start_character, end_line, end_character]`
        -   `{start = { line = start_line, character = start_character}, end = { line = end_line, character = end_character}}`
    -   `restore_selection` (boolean): Whether to preserve the current selection. Only valid when `range` is specified.
        Defaults to `true`.
    -   `callback`: Function to handle the action result. Must have this signature:
        `function(err: string|nil, ret: any)`:
        -   `err` is the error message, if any
        -   `ret` is the result
        -   If no callback is provided, error will be shown as a VSCode notification.

Example: open definition aside (default binding):

```vim
nnoremap <C-w>gd <Cmd>lua require('vscode').action('editor.action.revealDefinitionAside')<CR>
```

Example: find in files for word under cursor (see the
[vscode command definition](https://github.com/microsoft/vscode/blob/43b0558cc1eec2528a9a1b9ee1c7a559823bda31/src/vs/workbench/contrib/search/browser/searchActionsFind.ts#L177-L197)
for the expected parameter format):

```vim
nnoremap ? <Cmd>lua require('vscode').action('workbench.action.findInFiles', { args = { query = vim.fn.expand('<cword>') } })<CR>
```

Example: use in lua script:

```lua
-- Format current document
vscode.action("editor.action.formatDocument")

do -- Comment the three lines below the cursor
  local curr_line = vim.fn.line(".") - 1  -- 0-indexed
  vscode.action("editor.action.commentLine", {
    range = { curr_line + 1, curr_line + 3 },
  })
end

do -- Comment the previous line
  local curr_line = vim.fn.line(".") - 1 -- 0-indexed
  local prev_line = curr_line - 1
  if prev_line >= 0 then
    vscode.action("editor.action.commentLine", {
      range = { prev_line , prev_line },
    })
  end
end

do -- Find in files for word under cursor
  vscode.action("workbench.action.findInFiles", {
    args = { query = vim.fn.expand('<cword>') }
  })
end
```

Currently, two built-in actions are provided for testing purposes:

1. `_ping` returns `"pong"`
2. `_wait` waits for the specified milliseconds and then returns `"ok"`

```lua
do -- Execute _ping asynchronously and print the result
  vscode.action("_ping", {
    callback = function(err, res)
      if err == nil then
        print(res) -- outputs: pong
      end
    end,
  })
end
```

### vscode.call(name, opts, timeout)

Synchronously executes a vscode command.

Parameters:

-   `name` (string): The name of the action, generally a vscode command.
-   `opts` (table): Same as [vscode.action()](#vscodeactionname-opts).
-   `timeout` (number): Timeout in milliseconds. The default value is -1, which means there is no timeout.

Returns: the result of the action

Example: format selection (default binding):

```vim
xnoremap = <Cmd>lua require('vscode').call('editor.action.formatSelection')<CR>
nnoremap = <Cmd>lua require('vscode').call('editor.action.formatSelection')<CR><Esc>
nnoremap == <Cmd>lua require('vscode').call('editor.action.formatSelection')<CR>
```

Example: use in lua script:

```lua
-- Execute _ping synchronously and print the result
print(vscode.call("_ping")) -- outputs: pong

-- Wait for 1 second and print the return value 'ok'
print(vscode.call("_wait", { args = { 1000 } })) -- outputs: ok

-- Wait for 2 seconds with a timeout of 1 second
print(vscode.call("_wait", { args = { 2000 } }), 1000)
-- error: Call '_wait' timed out
```

### vscode.on(event, callback)

Currently no available events for user use.

### vscode.has_config(name)

Check if configuration has a certain value.

Parameters:

-   `name` (string|string[]): The configuration name or an array of configuration names.

Returns:

-   `boolean|boolean[]`: Returns `true` if the configuration has a certain value, `false` otherwise. If `name` is an
    array, returns an array of booleans indicating whether each configuration has a certain value or not.

Examples:

```lua
-- Check if the configuration "not.exist" exists
print(vscode.has_config("not.exist"))
-- Should return: false

-- Check multiple configurations
vim.print(vscode.has_config({ "not.exist", "existing.config" }))
-- Should return: { false, true }
```

### vscode.get_config(name)

Get configuration value.

Parameters:

-   `name` (string|string[]): The configuration name or an array of configuration names.

Returns:

-   `unknown|unknown[]`: The value of the configuration. If `name` is an array, returns an array of values corresponding
    to each configuration.

Examples:

```lua
-- Get the value of "editor.tabSize"
print(vscode.get_config("editor.tabSize")) -- a number

-- Get multiple configurations
vim.print(vscode.get_config({ "editor.fontFamily", "editor.tabSize" }))
-- Should return: { "the font family", "the editor tabSizse" }
```

### vscode.update_config(name, value, target)

Update configuration value.

Parameters:

-   `name` (string|string[]): The configuration name or an array of configuration names.
-   `value` (unknown|unknown[]): The new value for the configuration.
-   `target` ("global"|"workspace"): The configuration target. Optional

Examples:

```lua
-- Update the value of "editor.tabSize"
vscode.update_config("editor.tabSize", 16, "global")

-- Update multiple configurations
vscode.update_config({ "editor.fontFamily", "editor.tabSize" }, { "Fira Code", 14 })
```

### vscode.notify(msg)

Show a vscode notification

You can set `vscode.notify` as your default notify function.

```lua
vim.notify = vscode.notify
```

### vscode.eval(code[, opts, timeout])

Evaluate javascript inside vscode and return the result. The code is executed in an async function context (so `await`
can be used). Use a `return` statement to return a value back to lua. Arguments passed from lua are available as the
`args` variable. The evaluated code has access to the
[VSCode API](https://code.visualstudio.com/api/references/vscode-api) through the `vscode` global.

Tips:

-   Make sure to `await` on asynchronous functions when accessing the API.
-   Use the global `logger` (e.g. `logger.info(...)`) to log messages to the output of vscode-neovim.
-   JSON serializable values (primitives and simple objects) can be returned and will be automatically serialized then
    deserialized to an equivalent lua value. If the return value is not JSON serializable then an error will be raised.
-   `globalThis['some_name'] = ...` can be used to persist values between calls.

Parameters:

-   `code` (string): The javascript to execute.
-   `opts` (table): Map of optional parameters:
    -   `args` (any): a value to make available as the `args` variable in javascript. Can be a single value such as a
        string or a table of multiple values.
-   `timeout` (number): The number of milliseconds to wait for the evalution to complete before cancelling. By default
    there is no timeout.

Returns:

-   The result of executing the provided code.

Examples:

```lua
local current_file = vscode.eval("return vscode.window.activeTextEditor.document.fileName")
local current_tab_is_pinned = vscode.eval("return vscode.window.tabGroups.activeTabGroup.activeTab.isPinned")
vscode.eval("await vscode.env.clipboard.writeText(args.text)", { args = { text = "some text" } })
```

### vscode.eval_async(code[, opts])

Like `vscode.eval()` but returns immediately and evaluates in the background instead.

Parameters:

-   `code` (string): The javascript to execute.
-   `opts` (table): Map of optional parameters:
    -   `args` (any): a value to make available as the `args` variable in javascript. Can be a single value such as a
        string or a table of multiple values.
    -   `callback`: Function to handle the eval result. Must have this signature: `function(err: string|nil, ret: any)`:
        -   `err` is the error message, if any
        -   `ret` is the result
        -   If no callback is provided, error will be shown as a VSCode notification.

### vscode.with_insert(callback)

Perform operations in insert mode. If in visual mode, this function will **preserve the selection** after switching to
insert mode.

Parameters:

-   `callback` (function): Callback function to run after switching to insert mode

Example: make `editor.action.addSelectionToNextFindMatch` work correctly in any mode.

```lua
vim.keymap.set({ "n", "x", "i" }, "<C-d>", function()
  vscode.with_insert(function()
    vscode.action("editor.action.addSelectionToNextFindMatch")
  end)
end)
```

![select-next](https://github.com/vscode-neovim/vscode-neovim/assets/47070852/5a93c87e-626a-4a70-a9ef-5084f747c7ef)

Example: make "editor.action.refactor" work correctly on the selection and support snippet manipulation after entering
VSCode snippet mode.

```lua
vim.keymap.set({ "n", "x" }, "<leader>r", function()
  vscode.with_insert(function()
    vscode.action("editor.action.refactor")
  end)
end)
```

![refactor](https://github.com/vscode-neovim/vscode-neovim/assets/47070852/1c436b76-5c0b-42a7-8eb4-6f149761dd3c)

### Builtin module overrides

1. [`vim.ui`](/runtime/vscode/ui.lua): use VSCode's UI components.
2. [`vim.lsp.buf`](/runtime/vscode/lsp/buf.lua): execute corresponding VSCode LSP commands.

### VimScript

> **Note:** Since 1.0.0, vimscript functions are deprecated. Use the [Lua](#%EF%B8%8F-api) api instead.

-   `VSCodeNotify()`/`VSCodeCall()`: deprecated, use [Lua](#%EF%B8%8F-api) `require('vscode').call()` instead.
-   `VSCodeNotifyRange()`/`VSCodeCallRange()`: deprecated, use [Lua](#%EF%B8%8F-api)
    `require('vscode').call(…, {range:…})` instead.
-   `VSCodeNotifyRangePos()`/`VSCodeCallRangePos()`: deprecated, use [Lua](#%EF%B8%8F-api)
    `require('vscode').call(…, {range:…})` instead.

You can also use `v:lua.require("vscode")` to access the API from VimScript.

## ⌨️ Keybindings (shortcuts)

There are three types of default/user keybindings in vscode-neovim:

-   **Neovim keybindings**: These are the keybindings that are defined in the extension's vimscript files or the user's
    `init.vim` file. These provide code navigation, buffer management, and other neovim-specific overrides.
-   **VSCode keybindings**: These are the keybindings that are defined in the extension's `package.json` or the user's
    `keybindings.json` file. These provide the ability to interact with VSCode's built-in features, and are used to make
    VSCode more Vim-like.
-   **VSCode passthrough keybindings**: These are the keybindings that are defined in the extension's `package.json` or
    the user's `keybindings.json` file, but simply pass the keypress through to Neovim. These are used to allow Neovim
    to handle certain keypresses that would otherwise be handled by VSCode.

This document only mentions some special cases, it is not an exhaustive list of keybindings and commands. Use VSCode and
Nvim features to see documentation and all defined shortcuts:

-   Run the `Preferences: Open Keyboard Shortcuts` vscode command and search for "neovim" to see all vscode and
    passthrough keybindings.
-   Use the Nvim `:help` command to see the documentation for a given neovim command or keybinding. For example try
    `:help :split` or `:help zo`.
    -   Note that `:help` for `<C-…>` bindings is spelled `CTRL-…`. For example to see the help for `<c-w>`, run
        `:help CTRL-W`.
-   Search the online Nvim documentation: <https://neovim.io/doc/user/>

### Keybinding Passthroughs

Every special (control/alt/non-alphanumerical) keyboard shortcut must be explicitly defined in VSCode to send to neovim.
By default, only bindings that are used by Neovim by default are sent.

> **Note:** if you want to pass additional control keys without adding a custom passthrough, see below.

To add a custom passthrough, for example <kbd>A-h</kbd> in normal mode, add to your `keybindings.json`:

```jsonc
{
    "command": "vscode-neovim.send",
    // the key sequence to activate the binding
    "key": "alt+h",
    // don't activate during insert mode
    "when": "editorTextFocus && neovim.mode != insert",
    // the input to send to Neovim
    "args": "<A-h>",
}
```

#### Insert mode control keys passthrough

Set by `vscode-neovim.ctrlKeysForInsertMode`.

Default: `["a", "d", "h", "j", "m", "o", "r", "t", "u", "w"]`

#### Normal mode control keys passthrough

Set by `ctrlKeysForNormalMode`.

Default:
`["a", "b", "d", "e", "f", "h", "i", "j", "k", "l", "m", "o", "r", "t", "u", "v", "w", "x", "y", "z", "/", "]"]`

#### Cmdline mode special keys passthrough

Always enabled.

-   Tab, Up, Down
-   Ctrl keys: `<C-h>` `<C-w>` `<C-u>` `<C-n>` `<C-p>` `<C-l>` `<C-g>` `<C-t>`
-   All `<C-r>` prefixed keys

#### Disable passthrough for certain filetypes

Set by `editorLangIdExclusions`.

Disable keybindings defined by this extension in certain filetypes. Please note that this will not affect all
keybindings.

#### Remove other vscode or passthrough keybindings

If the above configuration flags do not provide enough control, you can remove the keybindings by editing your
`keybindings.json` or using the VSCode keybindings editor:

![remove keybindings](https://github.com/vscode-neovim/vscode-neovim/assets/47070852/816e9734-bac3-4bbb-ab7f-13bf2e364794)

### Code navigation bindings

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

### Explorer/list navigation bindings

| Key                                 | VSCode Command                  |
| ----------------------------------- | ------------------------------- |
| <kbd>j</kbd> or <kbd>k</kbd>        | `list.focusDown/Up`             |
| <kbd>h</kbd> or <kbd>l</kbd>        | `list.collapse/select`          |
| <kbd>Enter</kbd>                    | `list.select`                   |
| <kbd>gg</kbd>                       | `list.focusFirst`               |
| <kbd>G</kbd>                        | `list.focusLast`                |
| <kbd>o</kbd>                        | `list.toggleExpand`             |
| <kbd>C-u</kbd> or <kbd>C-d</kbd>    | `list.focusPageUp/Down`         |
| <kbd>zo</kbd> or <kbd>zO</kbd>      | `list.expand`                   |
| <kbd>zc</kbd>                       | `list.collapse`                 |
| <kbd>zC</kbd>                       | `list.collapseAllToFocus`       |
| <kbd>za</kbd> or <kbd>zA</kbd>      | `list.toggleExpand`             |
| <kbd>zm</kbd> or <kbd>zM</kbd>      | `list.collapseAll`              |
| <kbd> / </kbd> or <kbd>Escape</kbd> | `list.toggleKeyboardNavigation` |

### Explorer file manipulation bindings

| Key          | VSCode Command                                |
| ------------ | --------------------------------------------- |
| <kbd>r</kbd> | `renameFile`                                  |
| <kbd>d</kbd> | `deleteFile`                                  |
| <kbd>y</kbd> | `filesExplorer.copy`                          |
| <kbd>x</kbd> | `filesExplorer.cut`                           |
| <kbd>p</kbd> | `filesExplorer.paste`                         |
| <kbd>v</kbd> | `explorer.openToSide`                         |
| <kbd>a</kbd> | `explorer.newFile`                            |
| <kbd>A</kbd> | `explorer.newFolder`                          |
| <kbd>R</kbd> | `workbench.files.action.refreshFilesExplorer` |

### Hover widget manipulation bindings

| Key            | VSCode Command                   |
| -------------- | -------------------------------- |
| <kbd>K</kbd>   | `editor.action.showHover`        |
| <kbd>h</kbd>   | `editor.action.scrollLeftHover`  |
| <kbd>j</kbd>   | `editor.action.scrollDownHover`  |
| <kbd>k</kbd>   | `editor.action.scrollUpHover`    |
| <kbd>l</kbd>   | `editor.action.scrollRightHover` |
| <kbd>gg</kbd>  | `editor.action.goToTopHover`     |
| <kbd>G</kbd>   | `editor.action.goToBottomHover`  |
| <kbd>C-f</kbd> | `editor.action.pageDownHover`    |
| <kbd>C-b</kbd> | `editor.action.pageUpHover`      |

## 📟 Neovim Commands

Default commands and bindings are available for file/scroll/window/tab management.

#### File management

See [vscode-file-commands.vim](/runtime/vscode/overrides/vscode-file-commands.vim) for file commands reference.

The extension aliases various Nvim commands (`:edit`, `:enew`, `:find`, `:quit`, etc.) to equivalent vscode commands.
Also their normal-mode equivalents (where applicable) such as <kbd>C-w q</kbd>, etc.

#### Tab management

See [vscode-tab-commands.vim](/runtime/vscode/overrides/vscode-tab-commands.vim) for tab commands reference.

The extension aliases various Nvim tab commands (`:tabedit`, `:tabnew`, `:tabfind`, `:tabclose`, `:tabnext`,
`:tabprevious`, `:tabfirst`, `:tablast`) to equivalent vscode commands. Also their normal-mode equivalents (where
applicable) such as <kbd>gt</kbd>, etc.

#### Buffer/window management

See [vscode-window-commands.vim](/runtime/vscode/overrides/vscode-window-commands.vim) for file commands reference.

The extension aliases various Nvim buffer/window commands (`:split`, `:vsplit`, `:new`, `:vnew`, `:only`) to equivalent
vscode commands. Also their normal-mode equivalents (where applicable) such as <kbd>C-w s</kbd>, etc.

> 💡 Split size distribution is controlled by `workbench.editor.splitSizing` setting. By default, it's `distribute`,
> which is equal to vim's `equalalways` and `eadirection = 'both'` (default).

To use VSCode command 'Increase/decrease current view size' instead of separate bindings for width and height:

-   `workbench.action.increaseViewSize`
-   `workbench.action.decreaseViewSize`

<details>
<summary>Copy this into init.vim</summary>

```vim
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
```

</details>

## 🎨 Highlights

There are two ways to customize highlight colors:

1. Set colors in nvim

    **Note**: Due to the support for the `syntax` option requiring processing of syntax highlights, all built-in
    highlight groups may be overridden or cleared. Therefore, please do not link any highlights to the built-in
    highlight groups.

2. Set colors in vscode

    - [vscode-neovim.highlightGroups.highlights](https://github.com/vscode-neovim/vscode-neovim/blob/2657c4506b3dffe0d069db2891e30cebd963c2be/package.json#L160C1-L202C19)
    - [ThemeColor](https://code.visualstudio.com/api/references/theme-color)

## 🧰 Developing

Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to contribute to this project.

## ❤️ Credits & External Resources

-   [vim-altercmd](https://github.com/kana/vim-altercmd) - Used for rebinding default commands to call VSCode command.
-   [neovim nodejs client](https://github.com/neovim/node-client) - NodeJS library for communicating with Neovim.
-   [VSCodeVim](https://github.com/VSCodeVim/Vim) - Used for various inspiration.
