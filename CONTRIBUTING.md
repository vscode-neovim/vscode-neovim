# Contributing

Thank you for your interest in contributing to the project! This project is the result of the passion and hard work of
many contributors, and we appreciate your help. To get started, please read this document to familiarize yourself with
the project.

## 🔧 Build

### Create and Install Package

How to build (and install) from source:

1. Clone the repo locally.

```sh
git clone https://github.com/vscode-neovim/vscode-neovim
```

2. Install the dependencies.

```sh
npm install
```

3. Build the VSIX package:

```sh
npx vsce package -o vscode-neovim.vsix
```

4. From VSCode, use the `Extensions: Install from VSIX` command to install the package.

### Develop

1. Open the repo in VSCode.
2. Go to debug view and click `Run Extension` (F5).

### Logging

You can view the extension logs in one of three locations

1. Via the `vscode-neovim` Output channel

    - Note: some messages are not logged to the Output channel, to avoid infinite loop. This is decided by the
      [`logToOutputChannel` parameter](https://github.com/vscode-neovim/vscode-neovim/blob/7337ffd5009067d074af5371171f277cb522aa9b/src/logger.ts#L184).

2. From the dev tools console (run the `Developer: Toggle Developer Tools` vscode command to see the console) by
   enabling the `vscode-neovim.logOutputToConsole` setting.
3. From a log file of your choosing, by configuring the `vscode-neovim.logPath` setting.

VSCode, by default will only show messages at the "Info" level or above, but than can be changed by running the command
`Developer Set Log Level...` -> `vscode-neovim` and selecting the desired log level. You can also do this by clicking
the gear icon in the output pane, with `vscode-neovim` selected.

### Run Unit Tests

Unit tests run in node only (not vscode), and can call code directly (unlike the integration tests). You can run unit
tests independently by doing `npm run test:unit`.

### Run Integration Tests

Integration tests exercise a vscode instance which runs the vscode-neovim extension in a separate "extension host"
process. These tests call the vscode API which indirectly exercises the extension; they cannot access the memory of the
extension directly. You can run integration tests by running `npm run test:integration` or interactively through VSCode
by:

1. Open the repo in VSCode.
2. Go to debug view and click `Extension Tests` (F5).
3. To run individual tests, modify `test_regex = ".*"` in `src/test/integ/index.ts` or set the `NEOVIM_TEST_REGEX`
   environment variable, e.g. `NEOVIM_TEST_REGEX="foo bar" npm run test`.

## Style and Tools

-   checks should be run before each commit. They should be enabled upon dependency initialization, but if not, you can
    run `npx husky` to install them.
-   run `npm run format` to automatically format typescript and lua code.
-   run `npm run lint` to check for errors in typescript code.

## Design Principles

-   **Focus on removing code**. As it is, the project is already too large and complex, full of workarounds due to
    historical limitations in nvim or vscode APIs. Today, there are likely better ways to do things. Most PRs should
    focus on reducing technical debt, and thinning the wrapper layer between nvim and vscode.
-   **Delegate as much as possible to nvim**. The extension should merely be a wrapper around nvim, and should not
    reimplement any functionality. For example, instead of implementing scroll commands in the extension, a generic
    scroll sync mechanism should be added that lets nvim implement them. This solves many workarounds, improves plugin
    compatibility, and makes the extension easier to maintain. This also applies to configuration, keybindings,
    highlighting, etc. If it can be done in nvim (or with a nvim plugin), it should be done in nvim.
-   **Don't interfere with what vscode does best**. Neovim should take a back seat in insert mode and not attempt to do
    highlighting, LSP, snippets, etc. Implementing this would be a huge undertaking and likely degrade the vscode
    experience with bugs and lag. Instead, the extension should focus on providing a good experience in normal mode, and
    delegate to vscode in insert mode.
-   **Neovim features, plugins, and commands should work out of the box**. If this extension was perfect, there would be
    no need for a README since everything would work as expected.

## Getting Started

If you are new to contributing, please take a look at issues labelled as
["good first issue"](https://github.com/vscode-neovim/vscode-neovim/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+label%3A%22good+first+issue%22)
or
["help wanted"](https://github.com/vscode-neovim/vscode-neovim/issues?q=is%3Aissue+is%3Aopen+sort%3Aupdated-desc+label%3A%22help+wanted%22+)
to get started. These issues are usually smaller in scope and complexity, and are a good way to get familiar with the
codebase.

Another good way to get started is to look at bugs on the issue tracker and try to play around with them. Finally, some
simpler pieces of code include the shortcuts in `package.json` and the vimscript files, there are always ways to better
support nvim bindings.

## Project Structure

-   `src/`: The main extension code. This is where most of the work happens.
    -   `test/`: The extension tests.
    -   `extension.ts`: The entrypoint for the extension.
    -   `main_controller.ts`: The main controller for the extension. This is where nvim is spawned, communication is set
        up, and all managers are initialized.
    -   `extension.ts`: The entrypoint for the extension.
    -   All other files are managers responsible for syncing a specific aspect of the editor with nvim (such as mode)
        between vscode and nvim
-   `package.json`: The extension manifest. This is where the extension is configured. This is also where:
    -   Non-alphanumeric keyboard shortcuts are intercepted and sent to nvim.
    -   Default keybindings targeting vscode features are defined, to make vscode's interface feel more vim-like.
        Shortcuts defined here also have the advantage of having access to vscode's when clause contexts, and are easier
        for users to override.
    -   The keybindings are generated by scripts in `scripts/keybindings`. To update them, run `npm run keybind`.
-   `vim/`: The entrypoint for any code run within nvim.
    -   `vscode-neovim.vim`: The main vimscript file. This is where the communication between vscode and nvim is set up,
    -   The remaining files override various nvim commands and bindings to forward them to vscode for handling.
-   `runtime/lua`: The lua module that is loaded by nvim. Files in this directory are loaded by `vscode-neovim.vim`, and
    serve the exact same purpose as the vimscript files. The long term goal is to replace all vimscript with lua.

## How it works

-   VScode connects to Neovim instance.
-   When opening a file, a scratch buffer is created within Neovim and being initialized with text content from VSCode.
-   Normal/visual mode commands are being sent directly to Neovim. The extension listens for buffer events and applies
    edits from Neovim.
-   When entering the insert mode, the extensions stops listen for keystroke events and delegates typing mode to VSCode.
    Changes are synced to neovim in periodic intervals.
-   After pressing escape key from the insert mode, extension sends changes obtained from the insert mode to Neovim.

## Neovim APIs

### Node Client

VSCode-Neovim uses neovim's [`node-client`](https://neovim.io/node-client/index.html) library to communicate with
neovim. This library is a wrapper around neovim's [msgpack-rpc API](https://neovim.io/doc/user/api.html). The library is
used to send and receive messages to and from neovim. The library is also used to spawn neovim processes. Many functions
are exposed, listed [here](https://neovim.io/node-client/classes/NeovimClient.html). However, the library is not kept up
to date, so many API wrappers are missing. In those cases just use `call`, `lua`, and `command` instead.

### Neovim UI Protocol

VSCode-Neovim is built around neovim's ui protocol [:help ui](https://neovim.io/doc/user/ui.html). This protocol allows
vscode to listen to events emitted by neovim, such as `mode_change`, `hl_attr_define`, and `win_viewport`. This API
allows neovim to externalize the _rendering_ of various components of the editor, such as the cursor, highlights,
buffers, cmdline, etc. When possible, this protocol should be used as the source of truth for the state of the editor.

However, the UI protocol [is incomplete](https://github.com/neovim/neovim/issues/9421), and there are many holes in the
API. For example, there is no way to get the type of visual mode or the current visual selection, `win_viewport` is not
triggered on horizontal scrolling, there are no events for window splits and tabs, etc. As the nvim UI extension API is
improved, these holes should be filled in, and workarounds can be removed.

### Autocommands

Another event-driven API available is [autocommands](https://neovim.io/doc/user/autocmd.html). These are events that are
triggered when certain actions happen, such as `BufEnter`, `BufWrite`, `CursorMoved`, etc. These events populate
`<afile>`, `vim.v.event`, etc. All this data is available using
[nvim_create_autocmd](<https://neovim.io/doc/user/api.html#nvim_create_autocmd()>). Sometimes, these events contain more
information than the UI protocol, and should be used instead. For example, the `ModeChanged` autocommand contains the
type of visual mode, which is not available in the UI protocol. In that case, the autocommand should forward the event
to vscode for custom handling.

### Neovim Lua API

To send commands to neovim, and to (worst-case scenario) ask it for additional information, the
[neovim lua api](https://neovim.io/doc/user/api.html) can be used. As a last resort, the
[builtin](https://neovim.io/doc/user/builtin.html) API can be used.

To avoid RPC round trips, the logic using the lua or vim APIs should be moved to a custom lua function running in nvim.

### Set up VSCode for lua development

-   Install [sumneko.lua](marketplace.visualstudio.com/items?itemName=sumneko.lua).

-   In nvim, run `lua=vim.api.nvim_get_runtime_file("", true)`
-   Add runtime path to `settings.json`, like:

```json
  "Lua.workspace.library": ["/usr/share/nvim/runtime/"],
  "Lua.diagnostics.globals": ["vim"]
```

## VSCode API

The VSCode API is provided [here](https://code.visualstudio.com/api).

## Managers

VSCode-Neovim is structured using a manager pattern. Each manager is responsible for syncing a specific aspect of the
editor with nvim, and roughly matches the nvim ui API. Managers can do the following:

-   Listen to ui and custom events from nvim through `eventBus.on` (`src/eventBus.ts`).
-   Listen to vscode events such as `window.onDidChangeTextEditorSelection` and `workspace.onDidChangeTextDocument`.
-   Access the lua API through `this.client.call` and `this.client.lua`.

### ModeManager

ModeManager listens to the custom `mode_change` event triggered by the `ModeChanged` autocommand, and:

-   Provides `this.main.modeManager.isInsertMode`, `this.main.modeManager.isVisualMode` and equivalent properties for
    other modes.
-   Provides an `onModeChange` subscription that can be used to listen to mode changes.
-   Sets the vscode context `neovim.mode` to the current mode.

### CommandLineManager

CommandLineManager listens to the `cmdline_show` and `cmdline_hide` events, from the `ext_cmdline` API. It then renders
the command line using a quickpick menu. This approach has several limitations, including no Up/Down bindings, limited
autocompletion, and no control over cursor position.

### HighlightManager

HighlightManager listens to the `ext_linegrid` API and renders highlights using VSCode text decorations.

### ViewportManager

ViewportManager is responsible for syncing the viewport (editor window, scroll position) between vscode and nvim. It
listens to the `win_viewport` event, and supplements it with the custom `viewport-changed` event. It also keeps track of
the cursor position more reliably than `grid_cursor_goto`.

### CursorManager

CursorManager is responsible for the two-way sync between the cursor in vscode and nvim. CursorManager is also
responsible for updating the VSCode cursor style.

On the neovim side, the cursor position is (0,0), (1,0), or (1,1) indexed depending on the API being used. As a
convention, VSCode-Neovim should stick to (0,0) indexing (to match vscode), and convert to other forms when necessary.

On the VSCode side, the cursor position is represented by the first element of the `editor.selections` array. When the
cursor is a range of length 1, it is rendered as a cursor, otherwise, it is a selection. For this reason, the vscode
cursor will always contain an anchor and an active position, even when the cursor is a single point.

#### Neovim -> VSCode

CursorManager listens to a wide range of events to detect if the cursor position should be updated, and then requests
the cursor position from `ViewportManager`. It then sets a lock that prevents other managers from working until the
cursor position is updated. The cursor update is then debounced for a short period of time to prevent jitter (since
neovim can rapidly send cursor updates on compound movements). Finally, the vscode cursor (selection) is updated and the
lock is removed.

In the case that the mode is visual, a different selection is created that represents the visual selection. However,
this means that sometimes the primary selection needed to select the visual range is not the same selection needed to
show the cursor at the correct position. For this reason, during insert mode, the vscode cursor is hidden and instead a
"fake cursor" is rendered as a text decoration using the highlight API in `runtime/lua/vscode-neovim/cursor.lua`.

#### VSCode -> Neovim

Two-way synchronization of async APIs is always a challenge. If both sides update the other immediately, they can step
on each other and result in unpredictable behaviour. VSCode-Neovim solves this by making neovim the "source of truth"
and debouncing all VSCode cursor updates by a nontrivial period of time. This means that when editing code, the VSCode
cursor will see neovim updates immediately, but neovim will only see VSCode updates after a delay after the user is done
typing. This delay is configurable. This means clicking with a mouse or executing a vscode command will result in a
delay before the cursor is updated in neovim.

### TypingManager

TypingManager controls the bridge between vscode and nvim when typing. It listens to the vscode `type` event and
forwards keystrokes to nvim. It also provides the `vscode-neovim.send/escape` family of commands that allow VSCode
bindings to send non alphanumaric keystrokes to nvim.

TypingManager is responsible for unregistering the `type` event when nvim is in insert mode, and registering it when
nvim is in normal mode. It also contains some logic to handle keys that are pressed during the transition. Since nvim is
effectively deactivated during insert mode, TypingManager is also responsible for ensuring the state is synced when nvim
is reactivated (such as dot-repeat, cursor pos, etc).

When switching modes, TypingManager also waits for any pending document changes and cursor updates to be processed
before sending the keys to nvim.

### DocumentChangeManager

DocumentChangeManager is responsible for the syncing of editor contents between vscode and nvim. It:

-   listens to the nvim `grid_line` event, processes the new lines, and updates the editor contents.
-   listens to the vscode `onDidChangeTextDocument` event, processes the changes, and updates the nvim contents.
-   sets a lock for other managers to wait for when processing a document edit
-   manages synchronization by using neovim's "change tick" which enumerates the changes made to the buffer.

For more information about possible improvements, see
[here](https://github.com/vscode-neovim/vscode-neovim/issues/1266).

### BufferManager

BufferManager is responsible for the syncing of buffers and windows between vscode and nvim.

## Maintenance

Commits should be made using ['conventional commits'](https://www.conventionalcommits.org/en/v1.0.0/). This allows for
automatic changelog generation and versioning.
[Release-please](https://github.com/google-github-actions/release-please-action) is used to automatically make releases.
It will accumulate merged PRs, and create a release PR. Once the release PR is merged, it will automatically create a
release and tag it. It will also publish it to the visual studio marketplace using repository secrets.
