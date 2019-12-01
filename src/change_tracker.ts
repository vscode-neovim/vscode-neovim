interface ChangeRange {
    start: number;
    end: number;
    newStart: number;
    newEnd: number;
    diff: number;
}

interface LineChange {
    type: "change";
    // positive values indicate that lines were added after this line, negative - deleted
    shiftWidth: number;
}

export class ChangeTracker {
    private lineChanges: LineChange[] = [];

    public addNewLineFrom(fromLine: number): void {
        const shift = this.getShiftWidthForLine(fromLine);
        const nearest = this.getNearestChangeForLine(fromLine - shift);
        if (nearest) {
            const nearestShift = this.getShiftWidthForLine(nearest.idx);
            if (fromLine <= nearest.idx + nearestShift + nearest.change.shiftWidth) {
                nearest.change.shiftWidth++;
                return;
            } else if (fromLine <= nearest.idx + nearestShift - nearest.change.shiftWidth) {
                nearest.change.shiftWidth++;
                const nextLine = fromLine - shift + 1;
                if (!this.lineChanges[nextLine]) {
                    this.lineChanges[nextLine] = {
                        type: "change",
                        shiftWidth: 0,
                    };
                }
                return;
            }
        }
        fromLine -= shift;
        this.lineChanges[fromLine] = {
            shiftWidth: 1,
            type: "change",
        };
    }

    public removeLineFrom(fromLine: number): void {
        const shift = this.getShiftWidthForLine(fromLine);
        const nearest = this.getNearestChangeForLine(fromLine - shift);
        if (nearest) {
            const nearestShift = this.getShiftWidthForLine(nearest.idx);
            if (fromLine === nearest.idx + nearestShift) {
                nearest.change.shiftWidth--;
                return;
            }
        }
        fromLine -= shift;
        this.lineChanges[fromLine] = {
            shiftWidth: -1,
            type: "change",
        };
    }

    public changeLine(line: number): void {
        const nearest = this.getNearestChangeForLine(line);
        // don't do anything if the line falls into nearest line + shiftWidth range
        // e.g. if there is a line 2 with shiftWidth + 1 (means line 3 was addded) and we change line 3, we won't store anything
        // since it's new line
        if (nearest) {
            const nearestShift = this.getShiftWidthForLine(nearest.idx);
            if (line <= nearest.idx + nearestShift + nearest.change.shiftWidth) {
                return;
            }
        }
        // if there is shift width on any previous line, account into it
        // e.g. if there is a line 2 with shiftWidth + 1 (means line 3 was added) and we change line 4
        // then we must store it as line 3 (since it's original document line)
        line -= this.getShiftWidthForLine(line);
        this.lineChanges[line] = { type: "change", shiftWidth: 0 };
    }

    public getChanges(): ChangeRange[] {
        const changes = this.lineChanges.slice(0);
        const final: ChangeRange[] = [];
        let diffForNextNewRange = 0;
        const skipIdx: number[] = [];
        for (const idxStr in changes) {
            const idx = parseInt(idxStr, 10);
            const change = changes[idx];
            if (change.shiftWidth < 0) {
                for (let i = idx + 1; i <= idx - change.shiftWidth; i++) {
                    skipIdx.push(i);
                    if (changes[i]) {
                        change.shiftWidth += changes[i].shiftWidth;
                    }
                }
            }
            if (!skipIdx.includes(idx)) {
                final.push({
                    start: idx,
                    newStart: idx + diffForNextNewRange,
                    end: change.shiftWidth < 0 ? idx + Math.abs(change.shiftWidth) : idx,
                    newEnd:
                        change.shiftWidth > 0
                            ? idx + change.shiftWidth + diffForNextNewRange
                            : idx + diffForNextNewRange,
                    diff: change.shiftWidth,
                });
            }
            diffForNextNewRange += change.shiftWidth;
        }
        console.log(final);
        return final;
    }

    public clear(): void {
        this.lineChanges = [];
    }

    private getNearestChangeForLine(line: number): { change: LineChange; idx: number } | undefined {
        const a = this.lineChanges.slice(0, line + 1);
        const indexes: number[] = [];
        for (const idxStr in a) {
            const idx = parseInt(idxStr, 10);
            indexes.push(idx);
        }
        const lastIndex = indexes.pop();
        if (lastIndex == null) {
            return;
        }
        return {
            change: this.lineChanges[lastIndex],
            idx: lastIndex,
        };
    }

    private getShiftWidthForLine(line: number): number {
        const a = this.lineChanges.slice(0, line);
        let total = 0;
        for (const idxStr in a) {
            const idx = parseInt(idxStr, 10);
            const change = this.lineChanges[idx];
            total += change.shiftWidth;
        }
        return total;
    }
}
