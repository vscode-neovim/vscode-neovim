/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import { inspect } from "util";

import { Disposable, window } from "vscode";
import * as vscode from "vscode";

import { disposeAll } from "./utils";

export enum LogLevel {
    /** Disables all logging. */
    none = 0,
    error = 1,
    warn = 2,
    info = 3,
    debug = 4,
}

export interface ILogger {
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
    log(uri: vscode.Uri | undefined, level: LogLevel, ...logArgs: any[]): void;
}

function getTimestamp(): string {
    return new Date().toISOString();
}

export class Logger implements Disposable {
    private disposables: Disposable[] = [];
    private fd = 0;
    private loggers: Map<string, ILogger> = new Map();
    private level!: LogLevel;
    private logToConsole!: boolean;
    private outputChannel?: vscode.LogOutputChannel;

    /**
     * Setup logging for the extension. Logs are dropped unless one or more of
     * `filePath`, `logToConsole`, or `outputChannel` is given.
     *
     * @param level Only log messages at or above this level, or never if set to `LogLevel.none`.
     * @param filePath Write messages to this file.
     * @param logToConsole Write messages to the `console` (Hint: run the "Developer: Toggle Developer Tools" vscode command to see the console).
     * @param outputChannel Write messages to this vscode output channel.
     */
    public init(level: LogLevel, filePath: string, logToConsole = false, outputChannel?: vscode.LogOutputChannel) {
        this.level = level;
        this.logToConsole = logToConsole;
        this.outputChannel = outputChannel;
        if (filePath && level !== LogLevel.none) {
            try {
                this.fd = fs.openSync(filePath, "w");
                this.disposables.push({
                    dispose: () => fs.closeSync(this.fd),
                });
            } catch {
                // ignore
            }
        }
    }

    public dispose(): void {
        disposeAll(this.disposables);
    }

    private log(level: LogLevel, scope: string, logToOutputChannel: boolean, args: any[]): void {
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
            this.logToConsole && console[level == LogLevel.error ? "error" : "log"](logMsg);
        }

        // Half-baked attempt to avoid infinite loop.
        // Preferred approach is for modules to decide this via `createLogger(…, logToOutputChannel=…)`.
        const activeDoc = window.activeTextEditor?.document; // "output:asvetliakov.vscode-neovim.vscode-neovim"
        const outputFocused = activeDoc?.uri.scheme === "output" || activeDoc?.fileName?.startsWith("output:");

        if (logToOutputChannel && this.outputChannel && activeDoc && !outputFocused) {
            const fullMsg = `${scope}: ${msg}`;
            switch (level) {
                case LogLevel.error:
                    this.outputChannel.error(fullMsg);
                    break;
                case LogLevel.warn:
                    this.outputChannel.warn(fullMsg);
                    break;
                case LogLevel.info:
                case LogLevel.debug:
                    // XXX: `vscode.LogOutputChannel` loglevel is currently readonly:
                    //      https://github.com/microsoft/vscode/issues/170450
                    //      https://github.com/PowerShell/vscode-powershell/issues/4441
                    // So debug() drops messages unless the user has increased vscode's log-level.
                    // Use info() until vscode adds a way to set the loglevel.
                    this.outputChannel.info(fullMsg);
                    break;
                case LogLevel.none:
                    // Do nothing. This should never happen because the logger isn't setup for level=none.
                    break;
            }
        }

        if (level === LogLevel.error) {
            window.showErrorMessage(msg);
        }
    }

    public createLogger(scope: string, logToOutputChannel: boolean): ILogger {
        const logger = this.loggers.has(scope)
            ? this.loggers.get(scope)!
            : {
                  debug: (...args: any[]) => {
                      if (this.level >= LogLevel.debug) {
                          this.log(LogLevel.debug, scope, logToOutputChannel, args);
                      }
                  },
                  info: (...args: any[]) => {
                      if (this.level >= LogLevel.info) {
                          this.log(LogLevel.info, scope, logToOutputChannel, args);
                      }
                  },
                  warn: (...args: any[]) => {
                      if (this.level >= LogLevel.warn) {
                          this.log(LogLevel.warn, scope, logToOutputChannel, args);
                      }
                  },
                  error: (...args: any[]) => {
                      if (this.level >= LogLevel.error) {
                          this.log(LogLevel.error, scope, logToOutputChannel, args);
                      }
                  },
                  log(uri: vscode.Uri | undefined, level: LogLevel, ...logArgs: any[]) {
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
                          case LogLevel.error:
                              logger.error(...logArgs);
                              break;
                          case LogLevel.warn:
                              logger.warn(...logArgs);
                              break;
                          case LogLevel.info:
                          case LogLevel.debug:
                              logger.debug(...logArgs);
                              break;
                          case LogLevel.none:
                              // Do nothing. This should never happen because the logger isn't setup for level=none.
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
