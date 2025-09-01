import { strict as assert } from "assert";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageJson = require("../../../package.json");

describe("Hidden Commands", () => {
    it("Hidden commands should be available programmatically but not in contributes.commands", () => {
        const contributeCommands = packageJson.contributes.commands;

        // Commands that should be hidden from command palette
        const hiddenCommands = [
            "vscode-neovim.commit-cmdline",
            "vscode-neovim.complete-selection-cmdline",
            "vscode-neovim.send-cmdline",
            "vscode-neovim.ctrl-b",
            "vscode-neovim.ctrl-d",
            "vscode-neovim.ctrl-e",
            "vscode-neovim.ctrl-f",
            "vscode-neovim.ctrl-u",
            "vscode-neovim.ctrl-y",
        ];

        // Verify none of the hidden commands appear in contributes.commands
        for (const hiddenCommand of hiddenCommands) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            const foundInContributes = contributeCommands.some((cmd: any) => cmd.command === hiddenCommand);
            assert.strictEqual(
                foundInContributes,
                false,
                `Command "${hiddenCommand}" should not be in contributes.commands but was found`,
            );
        }

        // Verify that keybindings still reference these commands (where applicable)
        const keybindings = packageJson.contributes.keybindings;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const commandsInKeybindings = new Set(keybindings.map((kb: any) => kb.command));

        // Commands that should be in keybindings
        const commandsWithKeybindings = [
            "vscode-neovim.send-cmdline",
            "vscode-neovim.ctrl-b",
            "vscode-neovim.ctrl-d",
            "vscode-neovim.ctrl-e",
            "vscode-neovim.ctrl-f",
            "vscode-neovim.ctrl-u",
            "vscode-neovim.ctrl-y",
        ];

        for (const command of commandsWithKeybindings) {
            const foundInKeybindings = commandsInKeybindings.has(command);
            assert.strictEqual(
                foundInKeybindings,
                true,
                `Command "${command}" should still be referenced in keybindings but was not found`,
            );
        }

        // Commands that are only used programmatically (not in keybindings)
        const programmaticCommands = [
            "vscode-neovim.commit-cmdline", // Used by cmdline manager internally
            "vscode-neovim.complete-selection-cmdline", // Was never implemented
        ];

        for (const command of programmaticCommands) {
            const foundInKeybindings = commandsInKeybindings.has(command);
            assert.strictEqual(
                foundInKeybindings,
                false,
                `Command "${command}" should not be in keybindings and was found`,
            );
        }
    });

    it("Non-hidden commands should still be in contributes.commands", () => {
        const contributeCommands = packageJson.contributes.commands;

        // Commands that should still be visible in command palette
        const visibleCommands = [
            "vscode-neovim.restart",
            "vscode-neovim.stop",
            "vscode-neovim.lua",
            "vscode-neovim.send",
            "vscode-neovim.send-blocking",
            "vscode-neovim.escape",
        ];

        for (const visibleCommand of visibleCommands) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            const foundInContributes = contributeCommands.some((cmd: any) => cmd.command === visibleCommand);
            assert.strictEqual(
                foundInContributes,
                true,
                `Command "${visibleCommand}" should be in contributes.commands but was not found`,
            );
        }
    });
});
