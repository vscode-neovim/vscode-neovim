import * as path from "path";

import { runTests } from "vscode-test";

console.log("Nvim path: " + process.env.NEOVIM_PATH);
console.log("Nvim debug: " + process.env.NEOVIM_DEBUG);
console.log("Nvim host: " + process.env.NEOVIM_DEBUG_HOST);
console.log("Nvim port: " + process.env.NEOVIM_DEBUG_PORT);

async function main(): Promise<void> {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");

        // The path to test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, "./suite/index");

        // Download VS Code, unzip it and run the integration test
        await runTests({ extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error("Failed to run tests");
        process.exit(1);
    }
}

main();
