// Override vscode commands: "type", "replacePreviousChar", "compositionStart", "compositionEnd"
// Learn more: https://github.com/microsoft/vscode-extension-samples/tree/main/vim-sample
import { commands, Disposable, TextEditor, TextEditorEdit, window, workspace } from "vscode";

import { CompositeKeys, config } from "./config";
import { createLogger } from "./logger";
import { MainController } from "./main_controller";
import { disposeAll, normalizeInputString } from "./utils";

const logger = createLogger("TypingManager");

export class TypingManager implements Disposable {
    private disposables: Disposable[] = [];
    /**
     * Flag indicating that we're going to exit insert mode and sync buffers into neovim
     */
    private isExitingInsertMode = false;
    /**
     * Flag indicating that we're going to enter insert mode and there are pending document changes
     */
    private isEnteringInsertMode = false;
    /**
     * Additional keys which were pressed after exiting insert mode. We'll replay them after buffer sync
     */
    private pendingKeysAfterExit = "";
    /**
     * Additional keys which were pressed after entering the insert mode
     */
    private pendingKeysAfterEnter = "";
    /**
     * Composing flag
     */
    private isInComposition = false;
    /**
     * The text that we need to send to nvim after composition
     */
    private composingText = "";

    /**
     * Flag indicating that we should take over vscode input, where "take over"
     * here means handling input by nvim.
     * If false, we should forward all input received from "type" to "default:type",
     * and "replacePreviousChar" to "default:replacePreviousChar".
     */
    private _takeOverVSCodeInput = false;

    // configs
    private useCompositeKeys!: boolean;
    private compositeKeys!: CompositeKeys;
    private compositeFirstKeys!: string[];
    private compositeSecondKeysForFirstKey!: Map<string, string[]>;
    // logic variables
    private compositeMatchedFirstKey?: string;
    private compositeTimer?: NodeJS.Timeout;

    // Notes:
    // 1. "type" and "replacePreviousChar" must be registered at the same time
    // 2. Forwarding the arguments of replacePreviousChar to default:replacePreviousChar
    //    causes text jitter during ime composition
    //
    // The compromise solution used here:
    // 1. When composite keys are needed, always register type and
    //    replacePreviousChar at the same time, which unavoidably causes text
    //    flickering during ime composition.
    // 2. When composite keys are not needed, only register type and
    //    replacePreviousChar when it's necessary to take over vscode input.

    // "type" and "replacePreviousChar" are commands that vscode provides to handle user typing.

    private typeHandler?: Disposable;
    private replacePreviousCharHandler?: Disposable;

    private get takeOverVSCodeInput() {
        return this._takeOverVSCodeInput;
    }

    private set takeOverVSCodeInput(takeOver: boolean) {
        this._takeOverVSCodeInput = takeOver;

        if (takeOver) {
            if (!this.typeHandler) this.typeHandler = commands.registerTextEditorCommand("type", this.onVSCodeType);
            if (!this.replacePreviousCharHandler)
                this.replacePreviousCharHandler = commands.registerCommand(
                    "replacePreviousChar",
                    this.onReplacePreviousChar,
                );
            return;
        }

        if (!this.useCompositeKeys) {
            this.typeHandler?.dispose();
            this.typeHandler = undefined;
            this.replacePreviousCharHandler?.dispose();
            this.replacePreviousCharHandler = undefined;
        }
    }

    private get client() {
        return this.main.client;
    }

    private get isInsertMode() {
        return this.main.modeManager.isInsertMode;
    }

    private get isRecordingInInsertMode() {
        return this.main.modeManager.isRecordingInInsertMode;
    }

    private vscodeDefaultType = (text: string) => commands.executeCommand("default:type", { text });

    public constructor(private main: MainController) {
        // Deprecation warning for old composite escape commands
        const deprecatedWarning = () => {
            window
                .showWarningMessage(
                    'The command "compositeEscape1" and "compositeEscape2" are deprecated. ',
                    "Read More",
                )
                .then(
                    (readMore) =>
                        readMore &&
                        commands.executeCommand(
                            "vscode.open",
                            "https://github.com/vscode-neovim/vscode-neovim/tree/master#composite-escape-keys",
                        ),
                );
        };
        this.disposables.push(
            commands.registerCommand("vscode-neovim.compositeEscape1", deprecatedWarning),
            commands.registerCommand("vscode-neovim.compositeEscape2", deprecatedWarning),
        );

        this.prepareCompositeKeys();
        workspace.onDidChangeConfiguration(this.prepareCompositeKeys, this, this.disposables);

        const warnOnEmptyKey = (method: (key: string) => Promise<void>): typeof method => {
            return (key: string) => {
                if (key) {
                    return method.apply(this, [key]);
                } else {
                    const link =
                        "command:workbench.action.openGlobalKeybindings?" +
                        encodeURIComponent('["vscode-neovim.send"]');
                    window.showErrorMessage(
                        `No args provided to vscode-neovim.send. Please check your [keybinds](${link}) ` +
                            "to ensure that all send commands include the args parameter.",
                    );
                    return Promise.resolve();
                }
            };
        };

        this.takeOverVSCodeInput = true;

        const registerCommand = (cmd: string, cb: (...args: any[]) => any) => {
            this.disposables.push(commands.registerCommand(cmd, cb, this));
        };
        registerCommand("vscode-neovim.send", warnOnEmptyKey(this.onSendCommand));
        registerCommand("vscode-neovim.send-blocking", warnOnEmptyKey(this.onSendBlockingCommand));
        registerCommand("vscode-neovim.escape", this.onEscapeKeyCommand);
        registerCommand("compositionStart", this.onCompositionStart);
        registerCommand("compositionEnd", this.onCompositionEnd);
        this.main.modeManager.onModeChange(this.onModeChange);
    }

    private prepareCompositeKeys() {
        this.compositeKeys = config.compositeKeys;
        this.compositeFirstKeys = [];
        this.compositeSecondKeysForFirstKey = new Map();
        Object.keys(this.compositeKeys).forEach((key) => {
            if (!/^[ -~]{2}$/.test(key)) {
                window.showErrorMessage(
                    `Invalid composite key: ${key}. Composite key must be exactly 2 ASCII characters long.`,
                );
                return;
            }
            const [first, second] = key.split("");
            this.compositeFirstKeys.push(first);
            const secondKeys = this.compositeSecondKeysForFirstKey.get(first) || [];
            secondKeys.push(second);
            this.compositeSecondKeysForFirstKey.set(first, secondKeys);
        });
        this.useCompositeKeys = this.compositeFirstKeys.length > 0;
    }

    private onModeChange = (): void => {
        if (this.main.modeManager.isInsertMode && this.takeOverVSCodeInput && !this.isRecordingInInsertMode) {
            const editor = window.activeTextEditor;
            const documentPromise = editor && this.main.changeManager.getDocumentChangeCompletionLock(editor.document);
            if (documentPromise) {
                logger.debug(`Waiting for cursor completion operation before disposing type handler`);
                this.pendingKeysAfterEnter = "";
                this.isEnteringInsertMode = true;
                documentPromise.then(async () => {
                    await this.main.cursorManager.waitForCursorUpdate(editor);
                    if (this.isInsertMode) {
                        this.takeOverVSCodeInput = false;
                    }
                    if (this.pendingKeysAfterEnter) {
                        logger.debug(
                            `Replaying pending keys after entering insert mode: ${this.pendingKeysAfterEnter}`,
                        );
                        await commands.executeCommand(this.isInsertMode ? "default:type" : "type", {
                            text: this.pendingKeysAfterEnter,
                        });
                        this.pendingKeysAfterEnter = "";
                    }
                    this.isEnteringInsertMode = false;
                });
            } else {
                this.takeOverVSCodeInput = false;
            }
        } else if (!this.isInsertMode) {
            this.isEnteringInsertMode = false;
            this.isExitingInsertMode = false;
            this.takeOverVSCodeInput = true;
        }
    };

    compositeInput(key: string) {
        if (!this.compositeMatchedFirstKey) {
            if (this.compositeFirstKeys.includes(key)) {
                this.compositeMatchedFirstKey = key;
                this.compositeTimer = setTimeout(() => {
                    this.compositeTimer = undefined;
                    this.compositeMatchedFirstKey = undefined;
                    this.vscodeDefaultType(key);
                }, config.compositeTimeout);
            } else {
                this.vscodeDefaultType(key);
            }
            return;
        }

        const desiredSecondKeys = this.compositeSecondKeysForFirstKey.get(this.compositeMatchedFirstKey);
        if (desiredSecondKeys?.includes(key)) {
            clearTimeout(this.compositeTimer);
            this.compositeTimer = undefined;

            const matchedFirstKey = this.compositeMatchedFirstKey;
            this.compositeMatchedFirstKey = undefined;
            const { command, args } = this.compositeKeys[matchedFirstKey + key];
            commands.executeCommand(command, ...(args ? args : []));
            return;
        }

        if (this.compositeTimer) {
            clearTimeout(this.compositeTimer);
            this.compositeTimer = undefined;

            const matchedFirstKey = this.compositeMatchedFirstKey;
            this.compositeMatchedFirstKey = undefined;
            this.vscodeDefaultType(matchedFirstKey + key);
            return;
        }

        this.vscodeDefaultType(key);
    }

    private onVSCodeType = async (_editor: TextEditor, _edit: TextEditorEdit, { text }: { text: string }) => {
        if (!this.takeOverVSCodeInput) {
            if (this.isInsertMode && !this.isInComposition) this.compositeInput(text);
            else this.vscodeDefaultType(text);
            return;
        }

        if (this.isEnteringInsertMode) {
            this.pendingKeysAfterEnter += text;
            return;
        }
        if (this.isExitingInsertMode) {
            this.pendingKeysAfterExit += text;
            return;
        }
        if (this.isInComposition) {
            this.composingText += text;
            return;
        }
        if (!this.isInsertMode || this.isRecordingInInsertMode) {
            this.client.input(normalizeInputString(text, !this.isRecordingInInsertMode));
            return;
        }
        if ((await this.client.mode).blocking) {
            this.client.input(normalizeInputString(text, !this.isRecordingInInsertMode));
        } else {
            this.takeOverVSCodeInput = false;
            this.compositeInput(text);
        }
    };

    private onSendCommand = async (key: string): Promise<void> => {
        logger.debug(`Send for: ${key}`);
        this.main.cursorManager.setWantInsertCursorUpdate(window.activeTextEditor, true);
        if (this.isInsertMode && !(await this.client.mode).blocking) {
            logger.debug(`Syncing buffers with neovim (${key})`);
            await this.main.changeManager.documentChangeLock.waitForUnlock();
            if (window.activeTextEditor)
                await this.main.cursorManager.updateNeovimCursorPosition(
                    window.activeTextEditor,
                    window.activeTextEditor.selection.active,
                    false,
                );
            await this.main.changeManager.syncDotRepeatWithNeovim();
            const keys = normalizeInputString(this.pendingKeysAfterExit);
            logger.debug(`Pending keys sent with ${key}: ${keys}`);
            this.pendingKeysAfterExit = "";
            await this.client.input(`${key}${keys}`);
        } else {
            this.isExitingInsertMode = false;
            await this.client.input(`${key}`);
        }
    };

    private onSendBlockingCommand = async (key: string): Promise<void> => {
        this.takeOverVSCodeInput = true;
        await this.onSendCommand(key);
    };

    private onEscapeKeyCommand = async (key = "<Esc>"): Promise<void> => {
        // rebind early to store fast pressed keys which may happen between sending changes to neovim and exiting insert mode
        // see https://github.com/asvetliakov/vscode-neovim/issues/324
        this.isExitingInsertMode = true;
        await this.onSendBlockingCommand(key);
    };

    private onReplacePreviousChar = (type: { text: string; replaceCharCnt: number }) => {
        if (!this.takeOverVSCodeInput) {
            commands.executeCommand("default:replacePreviousChar", type);
            return;
        }
        if (this.isInComposition)
            this.composingText =
                this.composingText.substring(0, this.composingText.length - type.replaceCharCnt) + type.text;
    };

    private onCompositionStart = (): void => {
        this.isInComposition = true;
    };

    private onCompositionEnd = (): void => {
        this.isInComposition = false;

        if (!this.isInsertMode)
            this.client.input(normalizeInputString(this.composingText, !this.isRecordingInInsertMode));

        this.composingText = "";
    };

    public dispose() {
        this.typeHandler?.dispose();
        this.replacePreviousCharHandler?.dispose();
        disposeAll(this.disposables);
    }
}
