import fs from "fs";

import { Disposable, window } from "vscode";

export enum LogLevel {
    none = 0,
    error = 1,
    warn = 2,
    debug = 3,
}

export class Logger implements Disposable {
    private disposables: Disposable[] = [];

    private fd = 0;

    public constructor(private logLevel: LogLevel, filePath: string, private outputToConsole = false) {
        if (logLevel !== LogLevel.none) {
            try {
                this.fd = fs.openSync(filePath, "w");
            } catch {
                // ignore
            }
        }
        // this.channel = window.createOutputChannel(EXT_NAME);
        // this.disposables.push(this.channel);
    }

    public dispose(): void {
        if (this.fd) {
            fs.closeSync(this.fd);
        }
        this.disposables.forEach((d) => d.dispose());
    }

    public debug(msg: string): void {
        msg = `${this.getTimestamp()} ${msg}`;
        if (this.logLevel >= LogLevel.debug) {
            if (this.fd) {
                fs.appendFileSync(this.fd, msg + "\n");
            }
            if (this.outputToConsole) {
                console.log(msg);
            }
        }
    }

    public warn(msg: string): void {
        msg = `${this.getTimestamp()} ${msg}`;
        if (this.logLevel >= LogLevel.warn) {
            if (this.fd) {
                fs.appendFileSync(this.fd, msg + "\n");
            }
            if (this.outputToConsole) {
                console.log(msg);
            }
        }
    }

    public error(msg: string): void {
        msg = `${this.getTimestamp()} ${msg}`;
        if (this.logLevel >= LogLevel.error) {
            if (this.fd) {
                fs.appendFileSync(this.fd, msg + "\n");
            }
            if (this.outputToConsole) {
                console.log(msg);
            }
        }
        window.showErrorMessage(msg);
    }

    private getTimestamp(): string {
        return new Date().toISOString();
    }
}
