import fs from "fs";
import { inspect } from "util";

import { Disposable, window } from "vscode";
import * as vscode from "vscode";

import { disposeAll } from "./utils";
import { EXT_NAME } from "./constants";

export interface ILogger {
    trace(...args: any[]): void;
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    /**
     * Logs a message only if `uri` is not a log file/channel (to avoid infinite loop).
     *
     * If the user is viewing the extension OutputChannel or logfile, we must
     * not log events triggered by that channel or file itself.
     *
     * @param uri Document that triggered the log event.
     * @param level Log level.
     * @param logArgs Log message format string followed by values.
     */
    log(uri: vscode.Uri | undefined, level: vscode.LogLevel, ...logArgs: any[]): void;
}

function getTimestamp(): string {
    return new Date().toISOString();
}

export class Logger implements Disposable {
    private disposables: Disposable[] = [];
    private loggers: Map<string, ILogger> = new Map();
    private fd: number | undefined;
    private filePath: string | undefined;
    private level!: vscode.LogLevel;
    private logToConsole!: boolean;
    private outputChannel!: vscode.LogOutputChannel;

    /**
     * Setup logging for the extension.
     *
     * @param filePath Write messages to this file.
     * @param logToConsole Write messages to the `console` (Hint: run the "Developer: Toggle Developer Tools" vscode command to see the console).
     */
    public init(filePath: string, logToConsole = false) {
        this.outputChannel = window.createOutputChannel(`${EXT_NAME} logs`, { log: true });
        this.disposables.push(
            this.outputChannel,
            this.outputChannel.onDidChangeLogLevel((level) => this.onLogLevelChanged(level)),
        );

        this.level = this.outputChannel.logLevel;
        this.logToConsole = logToConsole;
        this.filePath = filePath;
        this.setupLogFile();
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }

    private onLogLevelChanged(level: vscode.LogLevel) {
        this.level = level;
        this.setupLogFile();
    }

    private setupLogFile() {
        if (!this.filePath) {
            // extension restarted
            if (this.fd) {
                fs.closeSync(this.fd);
                this.fd = undefined;
            }
            return;
        } else if (this.level !== vscode.LogLevel.Off && this.fd) {
            return;
        } else if (this.level === vscode.LogLevel.Off && this.fd) {
            fs.closeSync(this.fd);
            this.fd = undefined;
            return;
        }

        try {
            this.fd = fs.openSync(this.filePath, "w");
        } catch (err) {
            window.showErrorMessage(`Can not open log file at ${this.filePath}: ${err}`);
            return;
        }

        this.disposables.push({
            dispose: () => {
                if (!this.fd) {
                    return;
                }

                fs.closeSync(this.fd);
            },
        });
    }

    private log(level: vscode.LogLevel, scope: string, logToOutputChannel: boolean, args: any[]): void {
        const msg = args.reduce((p, c, i) => {
            if (typeof c === "object") {
                try {
                    c = inspect(c, false, 2, false);
                } catch {
                    // ignore
                }
            }
            return p + (i > 0 ? " " : "") + c;
        }, "");

        if (this.fd || this.logToConsole) {
            const logMsg = `${getTimestamp()} ${scope}: ${msg}`;
            this.fd && fs.appendFileSync(this.fd, logMsg + "\n");
            this.logToConsole && console[level === vscode.LogLevel.Error ? "error" : "log"](logMsg);
        }

        // Half-baked attempt to avoid infinite loop.
        // Preferred approach is for modules to decide this via `createLogger(…, logToOutputChannel=…)`.
        const activeDoc = window.activeTextEditor?.document; // "output:asvetliakov.vscode-neovim.vscode-neovim"
        const outputFocused = activeDoc?.uri.scheme === "output" || activeDoc?.fileName?.startsWith("output:");
        if (logToOutputChannel && this.outputChannel && activeDoc && !outputFocused) {
            const fullMsg = `${scope}: ${msg}`;
            switch (level) {
                case vscode.LogLevel.Error:
                    this.outputChannel.error(fullMsg);
                    break;
                case vscode.LogLevel.Warning:
                    this.outputChannel.warn(fullMsg);
                    break;
                case vscode.LogLevel.Info:
                    this.outputChannel.info(fullMsg);
                    break;
                case vscode.LogLevel.Debug:
                    this.outputChannel.debug(fullMsg);
                    break;
                case vscode.LogLevel.Trace:
                    this.outputChannel.trace(fullMsg);
                    break;
                case vscode.LogLevel.Off:
                    // Do nothing. This should never happen because the logger isn't setup for level=off.
                    break;
            }
        }

        if (level === vscode.LogLevel.Error) {
            window.showErrorMessage(msg);
        }
    }

    public createLogger(scope: string, logToOutputChannel: boolean): ILogger {
        const logger = this.loggers.has(scope)
            ? this.loggers.get(scope)!
            : {
                  trace: (...args: any[]) => {
                      if (this.level <= vscode.LogLevel.Trace) {
                          this.log(vscode.LogLevel.Trace, scope, logToOutputChannel, args);
                      }
                  },
                  debug: (...args: any[]) => {
                      if (this.level <= vscode.LogLevel.Debug) {
                          this.log(vscode.LogLevel.Debug, scope, logToOutputChannel, args);
                      }
                  },
                  info: (...args: any[]) => {
                      if (this.level <= vscode.LogLevel.Info) {
                          this.log(vscode.LogLevel.Info, scope, logToOutputChannel, args);
                      }
                  },
                  warn: (...args: any[]) => {
                      if (this.level <= vscode.LogLevel.Warning) {
                          this.log(vscode.LogLevel.Warning, scope, logToOutputChannel, args);
                      }
                  },
                  error: (...args: any[]) => {
                      if (this.level <= vscode.LogLevel.Error) {
                          this.log(vscode.LogLevel.Error, scope, logToOutputChannel, args);
                      }
                  },
                  log(uri: vscode.Uri | undefined, level: vscode.LogLevel, ...logArgs: any[]) {
                      const isLogSink =
                          !uri ||
                          uri.scheme === "output" ||
                          uri.toString().startsWith("output:") ||
                          // XXX: may get filepath like
                          //    "/my/workspace/path/output:asvetliakov.vscode-neovim.vscode-neovim"
                          // This seems like a bug ("output:…" channel path appended to a workspace path?), but we should detect it here and avoid a loop nevertheless.
                          /[/\\]output:[^/\\]+$/i.test(uri.path);

                      if (isLogSink) {
                          return;
                      }

                      switch (level) {
                          case vscode.LogLevel.Error:
                              logger.error(...logArgs);
                              break;
                          case vscode.LogLevel.Warning:
                              logger.warn(...logArgs);
                              break;
                          case vscode.LogLevel.Info:
                              logger.info(...logArgs);
                              break;
                          case vscode.LogLevel.Debug:
                              logger.debug(...logArgs);
                              break;
                          case vscode.LogLevel.Trace:
                              logger.trace(...logArgs);
                              break;
                          case vscode.LogLevel.Off:
                              // Do nothing. This should never happen because the logger isn't setup for level=off.
                              break;
                      }
                  },
              };
        this.loggers.set(scope, logger);
        return logger;
    }
}

export const logger = new Logger();

export function createLogger(scope = "Neovim", logToOutputChannel = true): ILogger {
    return logger.createLogger(scope, logToOutputChannel);
}
