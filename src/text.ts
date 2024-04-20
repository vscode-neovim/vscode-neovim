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
