import { Disposable, StatusBarAlignment, StatusBarItem, window, workspace } from "vscode";

// !Maybe we can support &statusline

export class StatusLineController implements Disposable {
    private _modeText = "";
    private _statusText = "";
    private _msgText = "";
    private _seperator = " - ";

    private statusBar: StatusBarItem;

    public constructor() {
        this.statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 10);
        this._seperator = workspace.getConfiguration("window").get("titleSeparator", this._seperator);
    }

    private refreshStatusBar() {
        const items = [];
        this._modeText.length && items.push(this._modeText);
        this._statusText.length && items.push(this._statusText);
        this._msgText.length && items.push(this._msgText);
        if (items.length) {
            this.statusBar.text = items.join(this._seperator);
            this.statusBar.show();
        } else {
            this.statusBar.hide();
        }
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
