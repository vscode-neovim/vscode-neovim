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

type SettingPrefix = "neovimExecutablePaths" | "neovimInitVimPaths"; //this needs to be aligned with setting names in package.json

export type CompositeKeys = { [key: string]: { command: string; args?: any[] } };

export class Config implements Disposable {
    private disposables: Disposable[] = [];
    private readonly root = EXT_NAME;
    private cfg!: WorkspaceConfiguration;
    private readonly requireRestartConfigs = [
        "highlightGroups.highlights",
        "neovimClean",
        "NVIM_APPNAME",
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

    private getSystemSpecificSetting(settingPrefix: SettingPrefix): string | undefined {
        //https://github.com/microsoft/vscode/blob/master/src/vs/base/common/platform.ts#L63
        let platform = process.platform as "win32" | "darwin" | "linux";
        platform = this.useWsl && platform === "win32" ? "linux" : platform;
        return this.cfg.get(`${settingPrefix}.${platform}`);
    }

    private getNeovimPath(): string {
        return this.getSystemSpecificSetting("neovimExecutablePaths") ?? "nvim";
    }

    private getNeovimInitPath(): string | undefined {
        return this.getSystemSpecificSetting("neovimInitVimPaths");
    }

    get highlights(): { [key: string]: ThemableDecorationRenderOptions } {
        return this.cfg.get("highlightGroups.highlights")!;
    }
    // #region Keybindings
    get ctrlKeysNormalMode(): string[] {
        return this.cfg.get<string[]>("ctrlKeysForNormalMode")!;
    }
    get ctrlKeysInsertMode(): string[] {
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
    get outputToConsole() {
        return this.cfg.get("logOutputToConsole", false);
    }
    get statusLineSeparator() {
        return this.cfg.get("statusLineSeparator", "|");
    }

    get normalSelectionDebounceTime() {
        return this.cfg.get("normalSelectionDebounceTime", 100);
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
