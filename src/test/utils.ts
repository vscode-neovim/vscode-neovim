import { strict as assert } from "assert";
import net from "net";

import { NeovimClient, attach } from "neovim";
import {
    TextEditor,
    window,
    workspace,
    TextEditorCursorStyle,
    commands,
    Range,
    EndOfLine,
    Selection,
    ViewColumn,
    TextDocument,
} from "vscode";

/** Modes mapping
 * n - normal
 * v - visual
 * i - insert
 * r - replace
 * c - cmdline_normal
 * ci - cmdline_insert
 * cr - cmdline_replace
 * o - operator
 * ve - visual_select
 * e - cmdline_hover
 * s - statusline_hover
 * sd - statusline_drag
 * vs - vsep_hover
 * vd - vsep_drag
 * m - more
 * ml - more_lastline
 * sm - showmatch
 * can be combined, like no - normal operator
 */

export async function wait(timeout = 400): Promise<void> {
    await new Promise((res) => setTimeout(res, timeout));
}

export async function attachTestNvimClient(): Promise<NeovimClient> {
    const NV_HOST = process.env.NEOVIM_DEBUG_HOST || "127.0.0.1";
    const NV_PORT = process.env.NEOVIM_DEBUG_PORT || 4000;
    const conn = net.createConnection({ port: parseInt(NV_PORT as string, 10), host: NV_HOST });

    // const client = attach({ socket: { port: NV_PORT, host: NV_HOST } as any });
    const client = attach({ writer: conn, reader: conn });
    // wait for connection
    await client.channelId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).testConn = conn;
    return client;
}

export async function closeNvimClient(client: NeovimClient): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn: net.Socket = (client as any).testConn;

    // Try to gracefully close the socket first, this prevents noisy errors if it works.
    // The Neovim server seems well-behaved normally and will close the connection.
    conn.end();
    // After giving the server some time to respond for graceful shutdown,
    await wait(500);
    // destroy the connection forcefully if it hasn't already been closed.
    conn.resetAndDestroy();
}

export async function getCurrentBufferName(client: NeovimClient): Promise<string> {
    const buf = await client.buffer;
    const name = await buf.name;
    return name;
}

export async function getCurrentBufferContents(client: NeovimClient): Promise<string[]> {
    const buf = await client.buffer;
    const lines = await buf.lines;
    return lines;
}

export function getVSCodeContent(editor?: TextEditor): string[] {
    if (!editor) {
        editor = window.activeTextEditor;
    }
    if (!editor) {
        throw new Error("No active editor");
    }
    const text = editor.document.getText(new Range(0, 0, editor.document.lineCount, 0));
    const eol = editor.document.eol === EndOfLine.CRLF ? "\r\n" : "\n";
    return text.split(eol);
}

/**
 * Get current neovim cursor. ZERO based
 * @param client
 */
export async function getNeovimCursor(client: NeovimClient): Promise<[number, number]> {
    const [line1based, col0based] = await client.request("nvim_win_get_cursor", [0]);
    return [line1based - 1, col0based];
}

export async function getCurrentNeovimMode(client: NeovimClient): Promise<string> {
    // return mode short name
    const mode = await client.mode;
    return mode.mode;
}

export function getVScodeCursor(editor?: TextEditor): [number, number] {
    if (!editor) {
        editor = window.activeTextEditor;
    }
    if (!editor) {
        throw new Error("No active editor");
    }
    const { line, character } = editor.selection.active;
    return [line, character];
}

export function hasVSCodeCursorStyle(style: "block" | "underline" | "line", editor?: TextEditor): boolean {
    if (!editor) {
        editor = window.activeTextEditor;
    }
    if (!editor) {
        throw new Error("No active editor");
    }
    const cursorStyle = editor.options.cursorStyle;
    switch (style) {
        case "block":
            return cursorStyle === TextEditorCursorStyle.Block;
        case "underline":
            return cursorStyle === TextEditorCursorStyle.Underline;
        case "line":
            return cursorStyle === TextEditorCursorStyle.Line;
    }
}

export async function sendVSCodeCommand(command: string, args: unknown = "", waitTimeout = 400): Promise<void> {
    await commands.executeCommand(command, args);
    await wait(waitTimeout);
}

export async function sendVSCodeKeysAtomic(keys: string, waitTimeout = 200): Promise<void> {
    await sendVSCodeCommand("type", { text: keys }, waitTimeout);
}

export async function sendVSCodeKeys(keys: string, waitTimeout = 200): Promise<void> {
    let key = "";
    let append = false;
    for (const k of keys) {
        key = append ? key + k : k;
        if (k === "<") {
            append = true;
        } else if (k === ">") {
            append = false;
        }
        if (!append) {
            await sendVSCodeKeysAtomic(key, "iaAIoO.:".includes(k) ? 300 : 50);
        }
    }
    await wait(waitTimeout);
}

export async function sendNeovimKeys(client: NeovimClient, keys: string, waitTimeout = 500): Promise<void> {
    await client.input(keys);
    await wait(waitTimeout);
}

export async function sendEscapeKey(timeout = 400): Promise<void> {
    await commands.executeCommand("vscode-neovim.escape");
    while (!hasVSCodeCursorStyle("block")) {
        await wait(50);
    }
    await wait(timeout);
}

export async function sendInsertKey(key = "i", timeout = 300): Promise<void> {
    await sendVSCodeKeys(key, 0);
    while (!hasVSCodeCursorStyle("line")) {
        await wait(50);
    }
    await wait(timeout);
}

export async function sendVSCodeSpecialKey(
    key: "backspace" | "delete" | "cursorLeft" | "cursorRight" | "cursorUp" | "cursorDown",
    waitTimeout = 100,
): Promise<void> {
    switch (key) {
        case "backspace": {
            await commands.executeCommand("deleteLeft");
            break;
        }
        case "delete": {
            await commands.executeCommand("deleteRight");
            break;
        }
        case "cursorDown":
        case "cursorLeft":
        case "cursorRight":
        case "cursorUp": {
            await commands.executeCommand(key);
            break;
        }
    }
    await wait(waitTimeout);
}

export async function assertContent(
    options: {
        cursor?: [number, number];
        neovimCursor?: [number, number];
        vsCodeCursor?: [number, number];
        cursorLine?: number;
        content?: string[];
        cursorStyle?: "block" | "underline" | "line";
        mode?: string;
        vsCodeSelections?: Selection[];
        vsCodeVisibleRange?: { top?: number; bottom?: number };
    },
    client: NeovimClient,
    editor?: TextEditor,
    stack = new Error().stack,
): Promise<void> {
    if (!editor) {
        editor = window.activeTextEditor;
    }
    if (!editor) {
        throw new Error("No active editor");
    }
    try {
        if (options.content) {
            assert.deepEqual(await getCurrentBufferContents(client), options.content, "Neovim buffer content is wrong");
            assert.deepEqual(getVSCodeContent(), options.content, "VSCode content is wrong");
        }
        if (options.cursor) {
            assert.deepEqual(
                getVScodeCursor(editor),
                options.cursor,
                `Cursor position in vscode - ${options.cursor[0]}:${options.cursor[1]}`,
            );
            assert.deepEqual(
                await getNeovimCursor(client),
                options.cursor,
                `Cursor position in neovim - ${options.cursor[0]}:${options.cursor[1]}`,
            );
        }
        if (options.neovimCursor) {
            assert.deepEqual(
                await getNeovimCursor(client),
                options.neovimCursor,
                `Cursor position in neovim - ${options.neovimCursor[0]}:${options.neovimCursor[1]}`,
            );
        }
        if (options.vsCodeSelections) {
            assert.deepEqual(editor.selections, options.vsCodeSelections, "Selections in vscode are not correct");
        }
        if (options.vsCodeCursor) {
            assert.deepEqual(
                getVScodeCursor(editor),
                options.vsCodeCursor,
                `Cursor position in vscode - ${options.vsCodeCursor[0]}:${options.vsCodeCursor[1]}`,
            );
        }
        if (options.cursorLine) {
            const vscodeCursor = getVScodeCursor(editor);
            const nvimCursor = await getNeovimCursor(client);
            assert.deepEqual(
                vscodeCursor[0],
                options.cursorLine,
                `Cursor line position in vscode is not correct: ${vscodeCursor[0]}`,
            );
            assert.deepEqual(
                nvimCursor[0],
                options.cursorLine,
                `Cursor line position in neovim is not correct: ${vscodeCursor[0]}`,
            );
        }
        if (options.vsCodeVisibleRange) {
            const range = editor.visibleRanges[0];
            const top = range.start.line;
            const bottom = range.end.line;
            if (options.vsCodeVisibleRange.top) {
                assert.ok(
                    top === options.vsCodeVisibleRange.top ||
                        top === options.vsCodeVisibleRange.top - 1 ||
                        top === options.vsCodeVisibleRange.top + 1,
                    "Top visible range is wrong",
                );
            }
            if (options.vsCodeVisibleRange.bottom) {
                assert.ok(
                    bottom === options.vsCodeVisibleRange.bottom ||
                        bottom === options.vsCodeVisibleRange.bottom - 1 ||
                        bottom === options.vsCodeVisibleRange.bottom + 1,
                    "Bottom visible range is wrong",
                );
            }
        }
        if (options.cursorStyle) {
            assert.ok(
                hasVSCodeCursorStyle(options.cursorStyle),
                `VSCode cursor style should be: ${options.cursorStyle}`,
            );
        }
        if (options.mode) {
            assert.equal(await getCurrentNeovimMode(client), options.mode, `Neovim mode should be: ${options.mode}`);
        }
    } catch (e) {
        (e as Error).stack = stack;
        throw e;
    }
}

export async function setSelection(selection: Selection, waitTimeout = 400, editor?: TextEditor): Promise<void> {
    if (!editor) {
        editor = window.activeTextEditor;
    }
    if (!editor) {
        throw new Error("No editor");
    }

    editor.selections = [selection];
    await wait(waitTimeout);
}

export async function setCursor(line: number, char: number, waitTimeout = 400, editor?: TextEditor): Promise<void> {
    await setSelection(new Selection(line, char, line, char), waitTimeout, editor);
}

export async function copyVSCodeSelection(): Promise<void> {
    await sendVSCodeCommand("editor.action.clipboardCopyAction");
}
export async function pasteVSCode(): Promise<void> {
    await sendVSCodeCommand("editor.action.clipboardPasteAction");
}

export async function openTextDocument(options: { content: string; language?: string } | string): Promise<TextEditor> {
    let doc: TextDocument;
    if (typeof options === "string") {
        doc = await workspace.openTextDocument(options);
    } else {
        doc = await workspace.openTextDocument(options);
    }
    const editor = await window.showTextDocument(doc, ViewColumn.One);
    await setCursor(0, 0);
    await sendEscapeKey();
    return editor;
}

export async function closeActiveEditor(): Promise<void> {
    await commands.executeCommand("workbench.action.closeActiveEditor");
}

export async function closeAllActiveEditors(): Promise<void> {
    await commands.executeCommand("workbench.action.closeAllEditors");
}
