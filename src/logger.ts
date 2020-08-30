import { Disposable, OutputChannel, window } from "vscode";

import { EXT_NAME } from "./utils";

export enum LogLevel {
    error = 0,
    warn = 1,
    debug = 2,
}

export class Logger implements Disposable {
    private disposables: Disposable[] = [];

    private channel: OutputChannel;

    public constructor(private logLevel: LogLevel) {
        this.channel = window.createOutputChannel(EXT_NAME);
        this.disposables.push(this.channel);
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
    }

    public debug(msg: string): void {
        if (this.logLevel >= LogLevel.debug) {
            this.channel.appendLine(msg);
        }
    }

    public warn(msg: string): void {
        if (this.logLevel >= LogLevel.warn) {
            this.channel.appendLine(msg);
        }
    }

    public error(msg: string): void {
        if (this.logLevel >= LogLevel.error) {
            this.channel.appendLine(msg);
            window.showErrorMessage(msg);
        }
    }
}
