import GraphemeSplitter from "grapheme-splitter";
import wcswidth from "ts-wcwidth";

export function expandTabs(line: string, tabWidth: number): string {
    const [expanded, _finalIdx] = line.split("").reduce(
        ([acc, idx]: [string, number], char: string): [string, number] => {
            if (char === "\t") {
                const widthHere = tabWidth - (idx % tabWidth);
                const nextAcc = acc + " ".repeat(widthHere);
                return [nextAcc, idx + widthHere];
            }

            return [acc + char, idx + 1];
        },
        ["", 0],
    );

    return expanded;
}

export function splitGraphemes(str: string): string[] {
    const splitter = new GraphemeSplitter();
    return splitter.splitGraphemes(str);
}

export function calculateEditorColFromVimScreenCol(line: string, screenCol: number, tabSize: number): number {
    if (screenCol === 0 || !line) {
        return 0;
    }
    let currentCharIdx = 0;
    let currentVimCol = 0;
    while (currentVimCol < screenCol) {
        if (line[currentCharIdx] === "\t") {
            currentVimCol += tabSize - (currentVimCol % tabSize);
            currentCharIdx++;
        } else {
            currentVimCol += wcswidth(line[currentCharIdx]);
            currentCharIdx++;
        }

        if (currentCharIdx >= line.length) {
            return currentCharIdx;
        }
    }
    return currentCharIdx;
}

export function convertCharNumToByteNum(line: string, col: number): number {
    if (col === 0 || !line) {
        return 0;
    }

    let currCharNum = 0;
    let totalBytes = 0;
    while (currCharNum < col) {
        // VIM treats 2 bytes as 1 char pos for grid_cursor_goto/grid_lines (https://github.com/asvetliakov/vscode-neovim/issues/127)
        // but for setting cursor we must use original byte length
        const bytes = getBytesFromCodePoint(line.codePointAt(currCharNum));
        totalBytes += bytes;
        currCharNum += bytes === 4 ? 2 : 1;
        if (currCharNum >= line.length) {
            return totalBytes;
        }
    }
    return totalBytes;
}

export function convertByteNumToCharNum(line: string, col: number): number {
    let totalBytes = 0;
    let currCharNum = 0;
    while (totalBytes < col) {
        if (currCharNum >= line.length) {
            return currCharNum + (col - totalBytes);
        }
        const bytes = getBytesFromCodePoint(line.codePointAt(currCharNum));
        totalBytes += bytes;
        currCharNum += bytes === 4 ? 2 : 1;
    }
    return currCharNum;
}

function getBytesFromCodePoint(point?: number): number {
    if (point == null) {
        return 0;
    }
    if (point <= 0x7f) {
        return 1;
    }
    if (point <= 0x7ff) {
        return 2;
    }
    if (point >= 0xd800 && point <= 0xdfff) {
        // Surrogate pair: These take 4 bytes in UTF-8/UTF-16 and 2 chars in UTF-16 (JS strings)
        return 4;
    }
    if (point < 0xffff) {
        return 3;
    }
    return 4;
}

export function normalizeInputString(str: string, wrapEnter = true): string {
    let finalStr = str.replace(/</g, "<LT>");
    if (wrapEnter) {
        finalStr = finalStr.replace(/\n/g, "<CR>");
    }
    return finalStr;
}
