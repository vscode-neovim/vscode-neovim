async function main() {
    const path = await import("path");
    const fs = await import("fs");
    const packageJsonPath = path.join(__filename, "../../../package.json");
    const packageJson = require(packageJsonPath);

    const keybindings = [];
    fs.readdirSync(__dirname)
        .filter((f) => /^\d+_.*?\.cjs$/.test(f))
        .sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0])
        .map((m) => keybindings.push(...require(path.join(__dirname, m))));
    packageJson.contributes.keybindings = keybindings;

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + "\n");
}

main();
