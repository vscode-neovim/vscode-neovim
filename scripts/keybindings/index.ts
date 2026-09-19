import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getCmdlineKeybindings } from "./cmdline";
import { getCommonKeybindings } from "./common";
import { getInsertModeKeybindings } from "./insert_mode";
import { getNormalModeKeybindings } from "./normal_mode";
import { getVscodeIntegrationKeybindings } from "./vscode_integration";
import { getWidgetsKeybindings } from "./widgets";
import type { Keybinding } from "./util";

export function generateKeybindings(): Keybinding[] {
    const keybindings: Keybinding[] = [
        ...getCommonKeybindings(),
        ...getNormalModeKeybindings(),
        ...getInsertModeKeybindings(),
        ...getCmdlineKeybindings(),
        ...getWidgetsKeybindings(),
        ...getVscodeIntegrationKeybindings(),
    ];

    const seen = new Set<string>();
    for (const bind of keybindings) {
        const uniqueKey = `${bind.command}::${bind.key}::${bind.when ?? ""}`;
        if (seen.has(uniqueKey)) {
            throw new Error(`Duplicate keybinding found in final list: ${uniqueKey}`);
        }
        seen.add(uniqueKey);
    }

    return keybindings;
}

export function updatePackageJson(): void {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(currentDir, "../../package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    packageJson.contributes.keybindings = generateKeybindings();

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + "\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    updatePackageJson();
}
