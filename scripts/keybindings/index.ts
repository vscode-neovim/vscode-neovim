import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getCommonKeybindings } from "./common";
import { getNormalModeKeybindings } from "./normal_mode";
import { getInsertModeKeybindings } from "./insert_mode";
import { getCmdlineKeybindings } from "./cmdline";
import { getWidgetsKeybindings } from "./widgets";
import { getVscodeIntegrationKeybindings } from "./vscode_integration";
import type { Keybinding } from "./util";

export function generateKeybindings(): Keybinding[] {
    return [
        ...getCommonKeybindings(),
        ...getNormalModeKeybindings(),
        ...getInsertModeKeybindings(),
        ...getCmdlineKeybindings(),
        ...getWidgetsKeybindings(),
        ...getVscodeIntegrationKeybindings(),
    ];
}

export function updatePackageJson(): void {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = path.resolve(currentDir, "../../package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    packageJson.contributes.keybindings = generateKeybindings();

    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + "\n");
}

updatePackageJson();
