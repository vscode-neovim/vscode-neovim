import path from "path";

import * as vscode from "vscode";
import Mocha from "mocha";
import "source-map-support/register";

export async function run(): Promise<void> {
    let test_regex = process.env.NEOVIM_TEST_REGEX;
    if (test_regex === undefined) {
        test_regex = ".*";
    }
    console.log(`running tests by regex: ${test_regex}`);

    // Create the mocha test
    const mocha = new Mocha({
        ui: "bdd",
        timeout: 25000,
        bail: false,
        slow: 20000,
        fullTrace: true,
        grep: test_regex,
        retries: 2,
    });
    const testsRoot = path.resolve(__dirname, "..");

    return new Promise((c, e) => {
        return vscode.workspace.findFiles(new vscode.RelativePattern(vscode.Uri.file(testsRoot), "**/**.test.js")).then(
            (testFiles) => {
                // Add files to the test suite, in alphanumeric order.
                testFiles.sort((a, b) => a.fsPath.localeCompare(b.fsPath));
                for (const f of testFiles) {
                    mocha.addFile(path.resolve(testsRoot, f.fsPath));
                }

                try {
                    // Run the mocha test
                    mocha.run((failures) => {
                        if (failures > 0) {
                            e(new Error(`${failures} tests failed.`));
                        } else {
                            c();
                        }
                    });
                } catch (err) {
                    e(err);
                }
            },
            (err) => {
                e(err);
            },
        );
    });
}
