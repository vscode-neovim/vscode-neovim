import { normalizeInputString } from "../utils/text";

type TextChange = NoTextChange | TextEndChange | OtherTextChange;

interface TextEndChange {
    action: "added" | "removed";
    char: string;
}

interface NoTextChange {
    action: "none";
}

interface OtherTextChange {
    action: "other";
}

export function calculateInputAfterTextChange(oldText: string, newText: string): string {
    const change = diffLineText(oldText, newText);
    if (change.action === "added") {
        return normalizeInputString(change.char);
    } else if (change.action === "removed") {
        return "<BS>";
    } else if (change.action === "none") {
        // If no change, type nothing.
        return "";
    } else {
        // Rewrite the line if it's not a simple change
        return `<C-u>${normalizeInputString(newText)}`;
    }
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

export function commandInputIsCompletable(command: string): boolean {
    return (
        command.charAt(0) !== "?" &&
        command.charAt(0) !== "/" &&
        !command.includes("s/") &&
        !command.includes("substitute/") &&
        !command.includes("g/") &&
        !command.includes("global/") &&
        !command.includes("v/") &&
        !command.includes("vglobal/")
    );
}
