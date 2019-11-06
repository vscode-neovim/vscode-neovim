import { strict as assert } from "assert";
import net from "net";

import { NeovimClient, attach } from "neovim";
import { TextEditor, window, TextEditorCursorStyle, commands, Range, EndOfLine, Selection } from "vscode";

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

export async function wait(timeout = 100): Promise<void> {
    await new Promise(res => setTimeout(res, timeout));
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
    conn.destroy();
    // client.quit();
    await wait(1000);
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

export async function sendNeovimKeys(client: NeovimClient, keys: string, waitTimeout = 100): Promise<void> {
    await client.input(keys);
    await wait(waitTimeout);
}

export async function sendVSCodeKeys(keys: string, waitTimeout = 100): Promise<void> {
    await commands.executeCommand("type", { text: keys });
    await wait(waitTimeout);
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
        }
    }
    await wait(waitTimeout);
}

export async function assertContent(
    options: {
        cursor?: [number, number];
        vsCodeCursor?: [number, number];
        content?: string[];
        cursorStyle?: "block" | "underline" | "line";
        mode?: string;
        vsCodeSelections?: Selection[];
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
        if (options.content) {
            assert.deepEqual(await getCurrentBufferContents(client), options.content, "Neovim buffer content is wrong");
            assert.deepEqual(getVSCodeContent(), options.content, "VSCode content is wrong");
        }
        if (options.cursorStyle) {
            assert.ok(
                hasVSCodeCursorStyle(options.cursorStyle),
                `VSCode cursor style should be: ${options.cursorStyle}`,
            );
        }
        if (options.mode) {
            assert.equal(options.mode, await getCurrentNeovimMode(client), `Neovim mode should be: ${options.mode}`);
        }
    } catch (e) {
        e.stack = stack;
        throw e;
    }
}

export async function sendEscapeKey(waitTimeout = 500): Promise<void> {
    await commands.executeCommand("vscode-neovim.escape");
    await wait(waitTimeout);
}

export async function setSelection(
    selections: Array<{ anchorPos: [number, number]; cursorPos: [number, number] }>,
    waitTimeout = 100,
    editor?: TextEditor,
): Promise<void> {
    if (!editor) {
        editor = window.activeTextEditor;
    }
    if (!editor) {
        throw new Error("No editor");
    }

    editor.selections = selections.map(
        s => new Selection(s.anchorPos[0], s.anchorPos[1], s.cursorPos[0], s.cursorPos[1]),
    );
    await wait(waitTimeout);
}

export async function setCursor(line: number, char: number, waitTimeout = 100, editor?: TextEditor): Promise<void> {
    await setSelection([{ anchorPos: [line, char], cursorPos: [line, char] }], waitTimeout, editor);
}
export async function copyVSCodeSelection(): Promise<void> {
    if (!window.activeTextEditor) {
        throw new Error("No editor");
    }
    await commands.executeCommand("editor.action.clipboardCopyAction");
    await wait();
}

export async function pasteVSCode(): Promise<void> {
    if (!window.activeTextEditor) {
        throw new Error("No editor");
    }
    await commands.executeCommand("editor.action.clipboardPasteAction");
    await wait();
}

export async function closeActiveEditor(escape = true): Promise<void> {
    // need to clear to prevent vscode asking to save changes. works only with untitled editors
    if (escape) {
        await sendEscapeKey();
    }
    await commands.executeCommand("workbench.action.closeActiveEditor");
}

export async function closeAllActiveEditors(escape = true): Promise<void> {
    if (escape) {
        await sendEscapeKey();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _e of window.visibleTextEditors) {
        await closeActiveEditor(false);
    }
    await wait(1000);
}
