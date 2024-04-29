import {
    ConfigurationChangeEvent,
    Disposable,
    ExtensionKind,
    ThemableDecorationRenderOptions,
    WorkspaceConfiguration,
    commands,
    extensions,
    window,
    workspace,
} from "vscode";

import { CTRL_KEYS, EXT_ID, EXT_NAME } from "./constants";
import { VSCodeContext, disposeAll } from "./utils";

const isWindows = process.platform == "win32";

type LegacySettingName = "neovimPath" | "neovimInitPath";
type SettingPrefix = "neovimExecutablePaths" | "neovimInitVimPaths"; //this needs to be aligned with setting names in package.json
type Platform = "win32" | "darwin" | "linux";

export type CompositeKeys = { [key: string]: { command: string; args?: any[] } };

export class Config implements Disposable {
    private disposables: Disposable[] = [];
    private readonly root = EXT_NAME;
    private cfg!: WorkspaceConfiguration;
    private readonly requireRestartConfigs = [
        "highlightGroups.highlights",
        "neovimClean",
        "NVIM_APPNAME",
        "logLevel",
        "logOutputToConsole",
        "neovimWidth",
        "useWSL",
        "wslDistribution",
        "neovimInitVimPaths.darwin",
        "neovimInitVimPaths.linux",
        "neovimInitVimPaths.win32",
        "neovimExecutablePaths.darwin",
        "neovimExecutablePaths.linux",
        "neovimExecutablePaths.win32",
        "afterInitConfig",
    ].map((c) => `${this.root}.${c}`);

    dispose() {
        disposeAll(this.disposables);
    }

    public init() {
        this.onConfigurationChanged();
        workspace.onDidChangeConfiguration(this.onConfigurationChanged, this, this.disposables);
    }

    private onConfigurationChanged(e?: ConfigurationChangeEvent) {
        this.cfg = workspace.getConfiguration(this.root);
        VSCodeContext.set(`neovim.editorLangIdExclusions`, this.editorLangIdExclusions);
        const ctrlKeysNormalMode = this.ctrlKeysNormalMode;
        const ctrlKeysInsertMode = this.ctrlKeysInsertMode;
        CTRL_KEYS.forEach((k) => {
            VSCodeContext.set(`neovim.ctrlKeysNormal.${k}`, ctrlKeysNormalMode.includes(k));
            VSCodeContext.set(`neovim.ctrlKeysInsert.${k}`, ctrlKeysInsertMode.includes(k));
        });

        if (!e) return;
        const requireRestart = this.requireRestartConfigs.find((c) => e.affectsConfiguration(c));
        if (!requireRestart) return;

        window
            .showInformationMessage(`Changing "${requireRestart}" requires restart to take effect.`, "Restart")
            .then((value) => {
                if (value === "Restart") {
                    commands.executeCommand("vscode-neovim.restart");
                }
            });
    }

    private getSystemSpecificSetting(
        settingPrefix: SettingPrefix,
        legacySetting: { environmentVariableName?: "NEOVIM_PATH"; vscodeSettingName: LegacySettingName },
    ): string | undefined {
        //https://github.com/microsoft/vscode/blob/master/src/vs/base/common/platform.ts#L63
        const platform = process.platform as "win32" | "darwin" | "linux";

        const legacyEnvironmentVariable =
            legacySetting.environmentVariableName && process.env[legacySetting.environmentVariableName];

        //some system specific settings can be loaded from process.env and value from env will override setting value
        const legacySettingValue = legacyEnvironmentVariable || this.cfg.get(legacySetting.vscodeSettingName);
        if (legacySettingValue) {
            return legacySettingValue;
        } else if (this.useWsl && platform === "win32") {
            return this.cfg.get(`${settingPrefix}.${"linux" as Platform}`);
        } else {
            return this.cfg.get(`${settingPrefix}.${platform}`);
        }
    }

    private getNeovimPath(): string {
        const legacySettingInfo = {
            vscodeSettingName: "neovimPath",
            environmentVariableName: "NEOVIM_PATH",
        } as const;
        return this.getSystemSpecificSetting("neovimExecutablePaths", legacySettingInfo) ?? "nvim";
    }

    private getNeovimInitPath(): string | undefined {
        const legacySettingInfo = {
            vscodeSettingName: "neovimInitPath",
        } as const;
        return this.getSystemSpecificSetting("neovimInitVimPaths", legacySettingInfo);
    }

    get highlights(): { [key: string]: ThemableDecorationRenderOptions } {
        return this.cfg.get("highlightGroups.highlights")!;
    }
    // #region Keybindings
    get ctrlKeysNormalMode(): string[] {
        // deprecated
        if (!this.cfg.get("useCtrlKeysForNormalMode", true)) return [];
        return this.cfg.get<string[]>("ctrlKeysForNormalMode")!;
    }
    get ctrlKeysInsertMode(): string[] {
        if (!this.cfg.get("useCtrlKeysForInsertMode", true)) return [];
        return this.cfg.get<string[]>("ctrlKeysForInsertMode")!;
    }
    get editorLangIdExclusions(): string[] {
        return this.cfg.get<string[]>("editorLangIdExclusions")!;
    }
    // #endregion
    get useWsl() {
        const ext = extensions.getExtension(EXT_ID)!;
        return ext.extensionKind !== ExtensionKind.Workspace && isWindows && this.cfg.get("useWSL", false);
    }
    get wslDistribution() {
        return this.cfg.get("wslDistribution", "");
    }
    get revealCursorScrollLine() {
        return this.cfg.get("revealCursorScrollLine", false);
    }
    get neovimWidth() {
        return this.cfg.get("neovimWidth", 1000);
    }
    get neovimViewportWidth() {
        return this.neovimWidth;
    }
    get completionDelay() {
        return this.cfg.get("completionDelay", 1500);
    }
    get neovimViewportHeightExtend() {
        return this.cfg.get("neovimViewportHeightExtend", 1);
    }
    get neovimPath() {
        return this.getNeovimPath();
    }
    get neovimInitPath() {
        return this.getNeovimInitPath() ?? "";
    }
    get clean() {
        return this.cfg.get("neovimClean", false);
    }
    get NVIM_APPNAME() {
        return this.cfg.get("NVIM_APPNAME", "");
    }
    get logPath() {
        return this.cfg.get("logPath", "");
    }
    get logLevel(): "none" | "error" | "warn" | "debug" {
        return this.cfg.get("logLevel", "none");
    }
    get outputToConsole() {
        return this.cfg.get("logOutputToConsole", false);
    }
    get statusLineSeparator() {
        return this.cfg.get("statusLineSeparator", "|");
    }

    get normalSelectionDebounceTime() {
        return this.cfg.get("normalSelectionDebounceTime", 50);
    }
    get mouseSelectionDebounceTime() {
        return this.cfg.get("mouseSelectionDebounceTime", 100);
    }
    get disableMouseSelection() {
        return this.mouseSelectionDebounceTime === 0;
    }

    get compositeTimeout(): number {
        return this.cfg.get("compositeTimeout", 300);
    }
    get compositeKeys(): CompositeKeys {
        return this.cfg.get("compositeKeys", {});
    }
}

export const config = new Config();
