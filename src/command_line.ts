import { Disposable, InputBox, window } from "vscode";

export class CommandLineController implements Disposable {
    private input: InputBox;

    private disposables: Disposable[] = [];

    private prevInput = "";

    private isDisplayed = false;

    public constructor() {
        this.input = window.createInputBox();
        this.input.ignoreFocusOut = true;
        this.disposables.push(this.input.onDidAccept(this.handleAccept));
        this.disposables.push(this.input.onDidChangeValue(this.handleChange));
        this.disposables.push(this.input.onDidHide(this.handleCancel));
    }

    public show(): void {
        if (!this.isDisplayed) {
            this.input.value = "";
            this.prevInput = "";
            this.isDisplayed = true;
            this.input.show();
        }
    }

    public hide(): void {
        this.isDisplayed = false;
        this.prevInput = "";
        this.input.value = "";
        this.input.hide();
    }

    public update(value: string): void {
        this.prevInput = this.input.value;
        this.input.value = value;
    }

    public append(str: string): void {
        this.prevInput = this.input.value;
        this.input.value += str;
    }

    public onAccept?: () => void;
    public onChanged?: (str: string) => void;
    public onCanceled?: () => void;
    public onBacksapce?: () => void;

    public dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.input.dispose();
    }

    private handleAccept = (): void => {
        if (!this.onAccept) {
            return;
        }
        this.onAccept();
    };

    private handleChange = (e: string): void => {
        if (!this.onChanged) {
            return;
        }
        if (e.length < this.prevInput.length && this.onBacksapce) {
            // deleted character
            this.onBacksapce();
        } else {
            this.onChanged(e);
        }
    };

    private handleCancel = (): void => {
        this.isDisplayed = false;
        this.prevInput = "";
        this.input.value = "";
        if (!this.onCanceled) {
            return;
        }
        this.onCanceled();
    };
}
