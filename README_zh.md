# Neo Vim (VS Code Neovim)

Visual Studio Code的Neovim集成

对于那些不知道[Neovim](https://neovim.io/)的人来说，它是可以提供更好的VIM扩展性和嵌入性的VIM分支(fork)。该扩展使用完整的嵌入式neovim实例作为后端(插入模式和窗口/缓冲区/文件管理除外)，不再是一个VIM仿真半成品。

请向[vscode-neovim存储库](https://github.com/asvetliakov/vscode-neovim)报告任何问题/建议

## 安装

-   安装[vscode-neovim](https://marketplace.visualstudio.com/items?itemName=asvetliakov.vscode-neovim)扩展
-   安装[Neovim](https://github.com/neovim/neovim/wiki/Installing-Neovim)要求 **0.5.0 nightly** 或更高版本
    -   提示：在系统软件包管理器安装之外，你还可以单独为vscode安装neovim-0.5.0-nightly
-   在扩展程序设置中设置neovim路径，然后你可以开始使用它了。
    -   **重点**，你必须指定neovim的完整路径，例如`C:\Neovim\bin\nvim.exe`或`/usr/local/bin/nvim`。
    -   **重点 2：** 设置ID为`vscode-neovim.neovimExecutablePaths.win32/linux/darwin`
-   **重要！：如果你已经拥有长长的&自定义的`init.vim`，我建议你使用[`if !exists('g：vscode')`](#determining-if-running-in-vscode-in-your-initvim)进行检查，以防止潜在的破坏和问题**。如果你出现了任何问题，请先尝试使用空的`init.vim`。

**要求** **Neovim 0.5+**。低于此版本的任何版本均无效。许多Linux发行版的软件包仓库中都有neovim的**旧**版本，总归得检查你要安装的版本。

如果收到了`Unable to init vscode-neovim: command 'type' already exists`这样的提示，请尝试卸载其他注册了`type`命令的VSCode扩展（例如[VSCodeVim](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim)或[Overtype](https://marketplace.visualstudio.com/items?itemName=adammaras.overtype)。

### WSL

如果要使用Neovim的WSL版本，请设置`useWSL`配置切换并指定nvim二进制文件的linux路径。为此需要Windows二进制文件`wsl.exe`和linux二进制文件`wslpath`。`wslpath`必须可以通过linux环境变量`$PATH`获取。使用`wsl --list`检查默认的Linux发行版是否正确。

## 特性

-   利用neovim几乎实现功能完整的VIM集成。
-   最好的VSCode插入模式(insert mode)。该插件在插入模式下将自己从`type`事件中解除绑定，因此当出现长补全窗时，不再存在键入滞后和卡顿的情况。
-   完整可用的VSCode功能-自动补全/跳转定义/代码片段/多重光标/等等...
-   支持vimrc/vim插件/等等（一些插件对vscode没有意义，例如nerdtree）。

## 要求

Neovim 0.5.0-nightly或更高版本

## 重点

-   可视模式不会产生真正的vscode选择（以前一些版本具有这个功能，但那是通过丑陋的方法实现的）。任何需要选择的vscode命令都无法生效。为了解决问题，从可视模式通过默认热键 (`f1`/`ctrl/cmd+shift+p`)调用VSCode命令选择器会将vim选择转换为实际的vscode选择。注释/缩进/格式化也可以直接使用。如果您正在使用一些自定义映射，来调用依赖于vscode选择的vscode命令，则可以使用`VSCodeNotifyRange`/`VSCodeNotifyRangePos`函数（第一个按行，后一个按字符），这些函数会将可视模式选择转换为vscode选择调用命令。参见 [这个例子](https://github.com/asvetliakov/vscode-neovim/blob/e61832119988bb1e73b81df72956878819426ce2/vim/vscode-code-actions.vim#L42-L54) 和 [映射](https://github.com/asvetliakov/vscode-neovim/blob/e61832119988bb1e73b81df72956878819426ce2/vim/vscode-code-actions.vim#L98)。
-   为了让这个扩展工作在最好状态，目前最好禁用`editor.scrollBeyondLastLine`。
-   当你键入某些命令时，它们可能会被替换为另一个命令，例如：`:write`将被`:Write`代替。这是正常的。
-   文件/标签/窗口管理（`:w`/`q`/等等...）命令被替换并映射到vscode操作。如果您正在使用一些自定义命令/自定义映射，则可能需要重新绑定它们以调用vscode操作。如果要使用自定义键绑定/命令，请参见下面的参考链接以获取示例。**不要**在脚本/键绑定中使用vim的`:w`等，它们将无法工作。
-   在Mac上，按住`h`, `j`, `k` 和 `l`移动键可能不会连续移动，为了修复这点，打开终端并执行以下命令：
    `defaults write com.microsoft.VSCode ApplePressAndHoldEnabled -bool false`

## VSCode的特定功能和差异

-   `=`，`==`映射到`editor.action.formatSelection`
-   可以从neovim调用vscode命令。参见`vscode-neovim.vim`文件中的vim函数`VSCodeCall/VSCodeNotify`。`VSCodeCall`是阻塞请求，而`VSCodeNotify`不是（参阅下文）
-   滚动由VSCode端完成。`<C-d>/<C-u>/等等...`稍有不同
-   文件管理命令（如`e`/`w`/`q`等已映射到相应的vscode命令，并且行为可能有所不同（参见下文）
-   `gd`/`<C-]`映射到`editor.action.revealDefinition`（快捷键F12），`<C-]>`在vim帮助文件中也有效
-   `gf`被映射到`editor.action.revealDeclaration`
-   `gH`被映射到`editor.action.referenceSearch.trigger`
-   `gD`/`gF`分别被映射到`editor.action.peekDefinition`和`editor.action.peekDeclaration`（在peek中打开）
-   `<Cw> gd`/`<Cw>gf`映射到`editor.action.revealDefinitionAside`（原始vim命令-打开新标签并转到光标下的文件，但是vscode/vim中，窗口/标签的含义是完全不同的，因此在这里做些不同的事情很有用）
-   `gh`被映射到`editor.action.showHover`
-   点重复（`.`）。从`0.0.52`版本上线。在更改范围内移动光标不会中断重复序列。也就是说，在neovim中，如果在插入模式下键入`abc<cursor>`，则将光标移至`a<cursor>bc`并键入1，此处重复序列将为`1`。但是在vscode中，它将是`a1bc`。重复命令`.`的另一个区别是只能从右到左删除文本。即，对于点重复，它将`<Del>`键当作`<BS>`键。

## 性能/延迟问题

如果你有任何性能问题（通常是光标抖动），请确保你没有使用以下扩展：

-   行号扩展（VSCode内置了对正常/相对行号的支持）
-   缩进指示扩展（VSCode具有内置的缩进指示）
-   括号荧光扩展（VSCode具有内置功能）
-   任何频繁渲修饰器/频繁将某些内容放入vscode装订线（例如在每个光标/行上移动）的扩展

这样的扩展可能本身很好并且可以很好地工作，但是在与任何应该控制光标位置的扩展（例如任何vim扩展）结合使用的时候，由于所有扩展之间共享vscode扩展主机，它可能表现很差。（例如，当一个扩展控制了主机，阻塞了另一个扩展，就会产生抖动）。

如果你不确定，请禁用除我之外的所有扩展，**重载vscode/窗口**，然后在报告之前查看问题是否仍然存在。

也有报告说某些vim设置/ vim插件会增加延迟并导致性能问题。确保已禁用不需要的插件。它们有一些对vscode是没有意义的，并可能导致任何类型的问题。你不需要任何代、高亮、补全、lsp插件，以及任何生成窗口/缓冲区的插件（nerdtree和类似的东西），fuzzy-finders插件等等。您可能需要保持导航/文本对象/文本编辑/等等插件——这些应该没问题。

## 在插入模式下将jj或jk用作escape键

放入你的keybindings.json中：

对于`jj`

```json
{
    "command": "vscode-neovim.compositeEscape1",
    "key": "j",
    "when": "neovim.mode == insert && editorTextFocus",
    "args": "j"
}
```

要启用`jk`，再添加：

```json
{
    "command": "vscode-neovim.compositeEscape2",
    "key": "k",
    "when": "neovim.mode == insert && editorTextFocus",
    "args": "k"
}
```

## 在init.vim中确定是否在vscode中运行

这应该可以解决问题：

```vim
if exists('g:vscode')
    " VSCode extension
else
    " ordinary neovim
endif
```

##  从neovim调用vscode动作

有[一些辅助功能](https://github.com/asvetliakov/vscode-neovim/blob/ecd361ff1968e597e2500e8ce1108830e918cfb8/vim/vscode-neovim.vim#L17-L39)可用于调用任何vscode命令：

-   `VSCodeNotify(command, ...)`/`VSCodeCall(command, ...)` - 调用带有可选参数的vscode命令
-   `VSCodeNotifyRange(command, line1, line2, leaveSelection ,...)`/`VSCodeCallRange(command, line1, line2, leavesSelection, ...)` - 从line1到line2产生真正的vscode选择并调用vscode命令。逐行。将leaveSelection参数置1，以在调用命令后离开vscode选择
-   `VSCodeNotifyRangePos(command, line1, line2, pos1, pos2, leaveSelection ,...)`/`VSCodeCallRangePos(command, line1, line2, pos1, pos2, leaveSelection, ...)` - 从line1.pos1到line2.pos2产生真正的vscode选择。逐字符。

名称中带有`Notify`的函数是非阻塞的，带有`Call`的函数是阻塞的。通常，除非您确实需要阻塞的`Call`，否则请**使用Notify**。

_例子_：

生成逐行选择并显示vscode命令（默认绑定）

```
function! s:showCommands()
    let startLine = line("v")
    let endLine = line(".")
    call VSCodeNotifyRange("workbench.action.showCommands", startLine, endLine, 1)
endfunction

xnoremap <silent> <C-P> <Cmd>call <SID>showCommands()<CR>
```

生成逐字符选择并显示vscode命令（默认绑定）：

```
function! s:showCommands()
    let startPos = getpos("v")
    let endPos = getpos(".")
    call VSCodeNotifyRangePos("workbench.action.showCommands", startPos[1], endPos[1], startPos[2], endPos[2], 1)
endfunction

xnoremap <silent> <C-P> <Cmd>call <SID>showCommands()<CR>
```

对vscode光标下的单词运行文件中查找：

```
nnoremap <silent> ? <Cmd>call VSCodeNotify('workbench.action.findInFiles', { 'query': expand('<cword>')})<CR>
```

转到定义（默认绑定）：

```
nnoremap <silent> <C-w>gd <Cmd>call VSCodeNotify('editor.action.revealDefinitionAside')<CR>
```

## 跳转列表

使用VSCode的跳转列表。如果你使用自定义映射，请确保绑定到`workbench.action.navigateBack` / `workbench.action.navigateForward`。标记（大写和小写）都可以

## Wildmenu补全

命令菜单上有wildmenu补全类型。补全选项在1.5秒后出现（写`:w`或`:noh`时不会打扰到你）。`<Up>/<Down>`选择选项，`<Tab>`确认。查看gif：

![wildmenu](/images/wildmenu.gif)

## 多重光标

多重光标工作在：

1. 插入模式
2. （可选）可视行模式
3. （可选）可视块模式

要从可视行/块模式中生成多重光标，请键入`ma`/`mA`或`mi`/`mI`（默认情况下）。效果差异：

-   对于可视行模式，`mi`在每个选定行上的第一个非空白字符开始插入模式，而`ma`在行的末尾
-   对于可视块模式，`mi`在每个选定行上的光标块之前开始插入，而`ma`在之后
-   `mA`/`mI`版本也考虑空行（仅对于可视行模式，对于可视块模式，它们与`ma`/`mi`相同）

参见实际使用的gif：

![多重光标](/images/multicursor.gif)

## 管理用于滚动/窗口/标签/等等的自定义键映射

-   有关滚动命令的参考，见[vscode-scrolling.vim](/vim/vscode-scrolling.vim)
-   有关文件命令的参考，见[vscode-file-commands.vim](/vim/vscode-file-commands.vim) 
-   有关选项卡命令的参考，见[vscode-tab-commands.vim](/vim/vscode-tab-commands.vim)
-   有关窗口命令的参考，见[vscode-window-commands.vim](/vim/vscode-window-commands.vim)

##  文件/标签管理命令

`:e[dit]`或`ex`

-   `:e` 不带参数且不带bang(`!`) - 打开快速打开窗口
-   `:e!` 不带参数且带bang - 打开打开文件对话框
-   `:e [文件名]`，例如`:e $MYVIMRC` - 在新标签页中打开文件。该文件必须存在
-   `:e! [文件名]`，例如`:e! $MYVIMRC` - 关闭当前文件（放弃所有更改）并打开一个文件。该文件必须存在

`ene[w]`

-   `enew` 在vscode中创建新的无标题文档
-   `enew!` 关闭当前文件（放弃所有更改）并创建新的无标题文档

`fin[d]`

-   打开vscode的快速打开窗口。不支持参数和标号(count)

`w[rite]`

-   不带bang(`!`)时保存当前文件
-   带bang时打开“另存为”对话框

`sav[eas]`

-   打开“另存为”对话框

`wa[ll]`

-   保存所有文件。bang什么都没做

`q[uit]`或键`<C-w> q` / `<C-w> c`

-   关闭活动的编辑器

`wq`

-   保存并关闭活动的编辑器

`qa[ll]`

-   关闭所有编辑器，但不退出vscode。行为类似于`qall!`，因此请注意未保存的更改

`wqa[ll]`/`xa[ll]`

-   保存所有编辑器并关闭

`tabe[dit]`

-   类似`e[dit]`。不带参数打开快速打开窗口，带参数在新选项卡中打开文件

`tabnew`

-   打开新的无标题文件

`tabf[ind]`

-   打开快速打开窗口

`tab`/`tabs`

-   不支持。对vscode没有意义

`tabc[lose]`

-   关闭活动的编辑器（标签）

`tabo[nly]`

-   关闭vscode **分组**（窗格）中的其他标签。这与vim不同，在vim中，`tab`就像一个新窗口，但在vscode中没有意义。

`tabn[ext]`或键`gt`

-   切换到vscode活动的**分组**（窗格）中的下一个（如果指定了参数，则转到`count`标签）

`tabp[revious]`或键`gT`

-   切换到vscode活动的**分组**（窗格）中的上一个（如果指定了参数，则转到`count`标签）

`tabfir[st]`

-   切换到编辑器活动分组中的第一个标签

`tabl[ast]`

-   切换到编辑器活动分组中的最后一个标签

`tabm[ove]`

-   暂不支持

键`ZZ`和`ZQ`分别绑定到`:wq`和`q!`

## 缓冲区/窗口管理命令

_注意_：拆分大小分布由`workbench.editor.splitSizing`设置控制。默认是`distribute`，映射到vim的`equalalways`和`eadirection = 'both'`（默认）

`sp[lit]`或键`<C-w> s`
-   水平分割编辑器。给定参数时，将打开在参数中指定的文件，例如`:sp $MYVIMRC`。文件必须存在

`vs[plit]`或键`<C-w> v`

-   垂直分割编辑器。当给定参数时，将打开在参数中指定的文件。文件必须存在

`new`或键`<C-w> n`

-   与`sp[lit]`类似，但如果未给定任何参数，则会创建新的无标题文件

`vne[w]`

-   与`vs[plit]`类似，但是如果未给定任何参数，则会创建新的无标题文件

`<C-w> ^`

-   暂不支持

`vert[ical]`/`lefta[bove]`/etc...

-   暂不支持

`on[ly]`或键`<C-w> o`

-   没有bang（`!`）时将所有编辑器分组并为一个。 **不**关闭编辑器
-   有bang时，从所有分组关闭除当前编辑器以外的所有编辑器

`<C-w> j/k/h/l`

-   聚焦位于下方/上方/左侧/右侧的分组

`<C-w> <C-j>/<C-i>/<C-h>/<C-l>`

-   将编辑器移至下方/上方/左侧/右侧。Vim没有类似的映射。**注意**：`<C-w> <C-i>`将编辑器上移。从逻辑上讲，应该是`<C-w> <C-k>`，但是vscode有很多映射到`<C-k> [key]`的命令，并且不允许在未先解除绑定的情况下使用`<C-w> <C-k>`

`<C-w> r/R/x`

-   不支持使用`<C-w> <C-j>`和类似操作移动编辑器

`<C-w> w`或`<C-w> <C-w>`

-   聚焦下一分组。行为可能与vim不同

`<C-w> W`或`<C-w> p`

-   聚焦上一分组。行为可能与vim不同。`<C-w> p`与vim完全不同

`<C-w> t`

-   聚焦第一编辑器分组（最左上角）

`<C-w> b`

-   聚焦最后一个编辑器分组（最右下角）


`<C-w> H/K/J/L`

-   暂不支持

`<C-w> =`

-   对齐所有编辑器到相同的宽度

`[count]<C-w> +`

-   按照（可选的）数值增加编辑器高度

`[count]<C-w> -`

-   按照（可选的）数值减少编辑器高度

`[count]<C-w> >`

-   按照（可选的）数值增加编辑器宽度

`[count]<C-w> <`

-   按照（可选的）数值减少编辑器宽度

使用VSCode命令“增加/减少当前视图大小”

-   `workbench.action.increaseViewSize`
-   `workbench.action.decreaseViewSize`
    <details>
    <summary>将这个复制到init.vim</summary>

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

    </details>
    <br>

`<C-w> _`

-   切换最大编辑器的尺寸。再按一次恢复尺寸

## 插入模式特设键

由`useCtrlKeysForInsertMode = true`启用（默认为true）

| 键                        | 描述                                                             | 状态                            |
| -------------------------- | ---------------------------------------------------------------- | --------------------------------- |
| `CTRL-r [0-9a-z"%#*+:.-=]` | 从寄存器粘贴                                              | 有效                             |
| `CTRL-a`                   | 粘贴先前插入的内容                                  | 有效                             |
| `CTRL-u`                   | 删除到行首的所有文本，若为空行，删除空行 | 绑定到VSCode按键               |
| `CTRL-w`                   | 删除单词左侧                                                 | 绑定到VSCode按键               |
| `CTRL-h`                   | 删除左侧字符                                            | 绑定到VSCode按键               |
| `CTRL-t`                   | 向右缩进行 right                                               | 绑定到VSCode缩进行       |
| `CTRL-d`                   | 向左缩进行                                                | 绑定到VSCode反缩进行    |
| `CTRL-j`                   | 插入行                                                      | 绑定到VSCode向后插入行 |

插入模式不支持其他键

## 标准模式控制键

由`useCtrlKeysForNormalMode = true`启用（默认为true）

请参阅vim手册以获取有关他们行为的帮助

-   CTRL-a
-   CTRL-b
-   CTRL-c
-   CTRL-d
-   CTRL-e
-   CTRL-f
-   CTRL-i
-   CTRL-o (见 https://github.com/asvetliakov/vscode-neovim/issues/181#issuecomment-585264621)
-   CTRL-r
-   CTRL-u
-   CTRL-v
-   CTRL-w
-   CTRL-x
-   CTRL-y
-   CTRL-]
-   CTRL-j
-   CTRL-k
-   CTRL-l
-   CTRL-h
-   CTRL-/

未发送其他控制键（通常对vscode无用）

## 命令行控制键（永远启用）

-   CTRL-h（删除左侧一个字符）
-   CTRL-w（删除左侧的单词）
-   CTRL-u（清除行）
-   CTRL-g / CTRL-t（在搜索模式下移至下一个/上一个结果）
-   CTRL-l（将光标下方的下一个字符添加到搜索中）
-   CTRL-n / CTRL-p（向下/上跳转历史记录）
-   `<Up>`/`<Down>`（选择下一个/上一个建议）（无法向上/向下导航历史记录，vscode不允许重新映射）
-   标签-选择建议

## 将其他键传递给neovim或禁用现有的ctrl键映射

### 要传递其他ctrl键序列，例如<C-Tab>，添加到你的keybindings.json中：

```json
{
    "command": "vscode-neovim.send",
    "key": "ctrl+tab",
    "when": "editorTextFocus && neovim.mode != insert",
    "args": "<C-Tab>"
}
```

### 要禁用现有的ctrl键序列，例如Ctrl+A，添加到keybindings.json中：

```json
{
    "command": "-vscode-neovim.send",
    "key": "ctrl+a"
}
```

## Vim-easymotion

坦白地说，原始的[vim-easymotion](https://github.com/easymotion/vim-easymotion)可以正常工作并且符合预期……除了一件事：它实际上用标记替换了文本，然后又恢复了。它可能适用于VIM，但对于VS Code，它会破坏文本，并在你跳转时报告许多错误。因此，我创建了专门的[vim-easymotion fork](https://github.com/asvetliakov/vim-easymotion)，它不会动你的文本，而是使用vscode文本修饰。只需将我的fork添加到你的`vim-plug`块中，或通过使用你最喜欢的vim插件安装，并删除原始的vim-easymotion。同样，（显然）跨窗口跳转也不会起作用，因此请不要使用它们。跳转快乐！

![easymotion](/images/easy-motion-vscode.png)

## Vim-commentary

如果你愿意，可以使用[vim-commentary](https://github.com/tpope/vim-commentary)。但是vscode已经具有这样的功能，为什么不使用它呢？添加到你的init.vim/init.nvim：

```
xmap gc  <Plug>VSCodeCommentary
nmap gc  <Plug>VSCodeCommentary
omap gc  <Plug>VSCodeCommentary
nmap gcc <Plug>VSCodeCommentaryLine
```

类似于vim-commentary，gcc是注释行（接受计数），在跳转/可视模式下使用gc。`VSCodeCommentary`只是一个简单调用`editor.action.commentLine`函数。

## VIM quick-scope

[quick-scope](https://github.com/unblevable/quick-scope)插件默认使用默认的vim HL分组，但它们通常被忽略。为修复这点，添加

```vim
highlight QuickScopePrimary guifg='#afff5f' gui=underline ctermfg=155 cterm=underline
highlight QuickScopeSecondary guifg='#5fffff' gui=underline ctermfg=81 cterm=underline
```

到你的init.vim

## 已知的问题

见[Issues部分](https://github.com/asvetliakov/vscode-neovim/issues)

## 如何运作

-   VScode连接到Neovim实例
-   打开某个文件时，将在nvim中创建一个暂存缓冲区，并用vscode中的文本内容初始化
-   标准/可视模式命令被直接发送到neovim。该扩展监听缓冲区事件并应用来自neovim的编辑
-   进入插入模式时，扩展停止监听按键事件，并将键入模式委托给vscode（此处不执行neovim通信）
-   从插入模式按退出键后，扩展程序将从插入模式获得的更改发送到neovim

## 鸣谢 & 外部资源

-   [vim-altercmd](https://github.com/kana/vim-altercmd)-用于重新绑定默认命令以调用vscode命令
-   [neovim nodejs client](https://github.com/neovim/node-client)-用于与Neovim通信的NodeJS库
