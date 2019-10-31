import { TextDocument, Range } from "vscode";

type Cols = Set<number>;
type ColHiglights = Map<number, Cols>;
type TypeHighlights = Map<string, ColHiglights>;
type UriHighlights = Map<string, TypeHighlights>;

export class HighlightProvider {
    private uriAllHighlights: UriHighlights = new Map();

    public add(uri: string, type: string, row: number, col: number): void {
        let uriTypeHighlights = this.uriAllHighlights.get(uri);
        if (!uriTypeHighlights) {
            uriTypeHighlights = new Map();
            this.uriAllHighlights.set(uri, uriTypeHighlights);
        }
        let typeHighlights = uriTypeHighlights.get(type);
        if (!typeHighlights) {
            typeHighlights = new Map();
            uriTypeHighlights.set(type, typeHighlights);
        }

        let rowHighlights = typeHighlights.get(row);
        if (!rowHighlights) {
            rowHighlights = new Set();
            typeHighlights.set(row, rowHighlights);
        }

        rowHighlights.add(col);
    }

    public removeLine(uri: string, row: number): void {
        const uriHighlights = this.uriAllHighlights.get(uri);
        if (!uriHighlights) {
            return;
        }
        for (const [, typeHighlights] of uriHighlights) {
            typeHighlights.delete(row);
        }
    }

    public removeAll(uri: string, row: number, col: number): void {
        const uriHighlights = this.uriAllHighlights.get(uri);
        if (!uriHighlights) {
            return;
        }
        for (const [, typeHighlights] of uriHighlights) {
            const rowHighlights = typeHighlights.get(row);
            if (!rowHighlights) {
                continue;
            }
            rowHighlights.delete(col);
        }
    }

    public clean(uri: string): void {
        this.uriAllHighlights.delete(uri);
    }

    public provideDocumentHighlights(document: TextDocument, type: string): Range[] {
        const docHighlights = this.uriAllHighlights.get(document.uri.toString());
        if (!docHighlights) {
            return [];
        }
        const typeHighlights = docHighlights.get(type);
        if (!typeHighlights) {
            return [];
        }
        const ranges: Range[] = [];
        for (const [row, cols] of typeHighlights) {
            const rowRanges = this.createRangeFromCols(row, [...cols]);
            if (rowRanges) {
                ranges.push(...rowRanges);
            }
        }
        return ranges;
    }

    private createRangeFromCols(row: number, cols: number[]): Range[] | undefined {
        if (!cols.length) {
            return;
        }
        const ranges: Range[] = [];
        const sortedCols = cols.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
        for (let i = 0; i < sortedCols.length; i++) {
            const startCol = sortedCols[i];
            let skipCol = startCol;
            // skip until range won't overlop, e.g. if there are 1, 2, 3, 5, 6, 7, we'll skil 2 and 6
            while (skipCol + 1 === sortedCols[i + 1]) {
                skipCol = sortedCols[i + 1];
                i++;
                continue;
            }
            const endCol = sortedCols[i];
            ranges.push(new Range(row, startCol, row, endCol + 1));
        }
        return ranges;
    }

}