import path from "path";

import Mocha from "mocha";
import glob from "glob";
import "source-map-support/register";

export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: "bdd",
        timeout: 35000,
        bail: false,
        slow: 20000,
        fullStackTrace: true,
    });
    mocha.useColors(true);
    const testsRoot = path.resolve(__dirname, "..");
    return new Promise((c, e) => {
        glob("**/**.test.js", { cwd: testsRoot }, (err, files) => {
            if (err) {
                return e(err);
            }
            // Add files to the test suite
            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
            try {
                // Run the mocha test
                mocha.run(failures => {
                    if (failures > 0) {
                        e(new Error(`${failures} tests failed.`));
                    } else {
                        c();
                    }
                });
            } catch (err) {
                e(err);
            }
        });
    });
}
