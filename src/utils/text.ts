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
