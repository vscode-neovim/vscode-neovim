import { Disposable, StatusBarAlignment, StatusBarItem, window } from "vscode";

import { config } from "./config";

// !Maybe we can support &statusline

export class StatusLineController implements Disposable {
    private _modeText = "";
    private _statusText = "";
    private _msgText = "";

    private statusBar: StatusBarItem;

    public constructor() {
        this.statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 10);
        this.statusBar.show();
    }

    private refreshStatusBar() {
        const items = [];
        this._modeText.length && items.push(this._modeText);
        this._statusText.length && items.push(this._statusText);
        this._msgText.length && items.push(this._msgText);
        // Always show the status line
        this.statusBar.text = items.join(config.statusLineSeparator);
    }

    public set modeString(str: string) {
        this._modeText = str;
        this.refreshStatusBar();
    }

    public set statusString(str: string) {
        this._statusText = str;
        this.refreshStatusBar();
    }

    public set msgString(str: string) {
        this._msgText = str;
        this.refreshStatusBar();
    }

    public dispose(): void {
        this.statusBar.dispose();
    }
}
