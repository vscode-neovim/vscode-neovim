export type TextChange = NoTextChange | TextEndChange | OtherTextChange;

export interface TextEndChange {
    action: "added" | "removed";
    char: string;
}

export interface NoTextChange {
    action: "none";
}

export interface OtherTextChange {
    action: "other";
}

export function diffLineText(oldLine: string, newLine: string): TextChange {
    const lengthDifference = newLine.length - oldLine.length;

    if (oldLine === newLine) {
        return { action: "none" };
    } else if (lengthDifference === 1 && oldLine + newLine[newLine.length - 1] === newLine) {
        return { action: "added", char: newLine[newLine.length - 1] };
    } else if (lengthDifference === -1 && oldLine.substring(0, oldLine.length - 1) === newLine) {
        return { action: "removed", char: oldLine[oldLine.length - 1] };
    } else {
        return { action: "other" };
    }
}
