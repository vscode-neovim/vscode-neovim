import fs from "fs";

import { Disposable, window } from "vscode";

export enum LogLevel {
    error = 0,
    warn = 1,
    debug = 2,
}

export class Logger implements Disposable {
    private disposables: Disposable[] = [];

    private fd = 0;

    public constructor(private logLevel: LogLevel, private filePath: string, private outputToConsole = false) {
        try {
            this.fd = fs.openSync(filePath, "w");
        } catch {
            // ignore
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
        if (this.logLevel >= LogLevel.error) {
            if (this.fd) {
                fs.appendFileSync(this.fd, msg + "\n");
            }
            window.showErrorMessage(msg);
            if (this.outputToConsole) {
                console.log(msg);
            }
        }
    }
}
