import fs from "fs";

import { Disposable, window, OutputChannel } from "vscode";
import { EXT_NAME } from "./utils";

export enum LogLevel {
    none = 0,
    error = 1,
    warn = 2,
    debug = 3,
}

export class Logger implements Disposable {
    private disposables: Disposable[] = [];

    private fd = 0;
    private channel: OutputChannel | null = null;

    public constructor(private logLevel: LogLevel, filePath: string, private outputToConsole = false, logToOutputChannel = false) {
        if (logLevel !== LogLevel.none) {
            try {
                this.fd = fs.openSync(filePath, "w");
            } catch {
                // ignore
            }
        }
        if (logToOutputChannel) {
            this.channel = window.createOutputChannel(EXT_NAME);
            this.disposables.push(this.channel);
        }
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
            if (this.channel) {
                this.channel.appendLine(msg);
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
            if (this.channel) {
                this.channel.appendLine(msg);
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
            if (this.channel) {
                this.channel.appendLine(msg);
            }
        }
        window.showErrorMessage(msg);
    }

    private getTimestamp(): string {
        return new Date().toISOString();
    }
}
