const keybinds = [
    {
        command: "vscode-neovim.escape",
        key: "ctrl+o",
        when: "editorTextFocus && neovim.mode == insert && neovim.ctrlKeysInsert",
        args: "<C-o>",
    },
    {
        command: "vscode-neovim.send",
        key: "ctrl+u",
        when: "editorTextFocus && neovim.mode == insert && neovim.ctrlKeysInsert",
        args: "<C-u>",
    },
    {
        command: "vscode-neovim.send",
        key: "ctrl+w",
        when: "editorTextFocus && neovim.mode == insert && neovim.ctrlKeysInsert",
        args: "<C-w>",
    },
    {
        command: "vscode-neovim.send",
        key: "ctrl+h",
        when: "editorTextFocus && neovim.mode == insert && neovim.ctrlKeysInsert",
        args: "<C-h>",
    },
    {
        command: "vscode-neovim.send",
        key: "ctrl+t",
        when: "editorTextFocus && neovim.mode == insert && neovim.ctrlKeysInsert",
        args: "<C-t>",
    },
    {
        command: "vscode-neovim.send",
        key: "ctrl+d",
        when: "editorTextFocus && neovim.mode == insert && neovim.ctrlKeysInsert",
        args: "<C-d>",
    },
    {
        command: "vscode-neovim.send",
        key: "ctrl+j",
        when: "editorTextFocus && neovim.mode == insert && neovim.ctrlKeysInsert",
        args: "<C-j>",
    },
    {
        command: "vscode-neovim.send",
        key: "ctrl+a",
        when: "editorTextFocus && neovim.mode == insert && neovim.ctrlKeysInsert",
        args: "<C-a>",
    },
    {
        command: "vscode-neovim.send-blocking",
        key: "ctrl+r",
        when: "editorTextFocus && neovim.mode == insert && neovim.ctrlKeysInsert",
        args: "<C-r>",
    },
];

module.exports = keybinds;
