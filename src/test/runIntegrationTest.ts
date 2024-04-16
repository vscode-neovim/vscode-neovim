import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");

        // The path to the extension test runner script
        const extensionTestsPath = path.resolve(__dirname, "./suite/index");

        // Download VS Code, unzip it and run the integration test
        await runTests({
            launchArgs: ["--disable-extensions"],
            extensionDevelopmentPath,
            extensionTestsPath,
            // Tell vscode-neovim to create a debug connection
            extensionTestsEnv: { NEOVIM_DEBUG: "1" },
        });
    } catch (err) {
        console.error(err);
        console.error("Failed to run tests");
        process.exit(1);
    }
}

main();
