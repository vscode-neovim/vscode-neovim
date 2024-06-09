export type VimCell = [string, number?, number?];
export interface LineCell {
    text: string;
    hlId: number;
}
export interface Highlight {
    text: string;
    hlId: number;
    virtText?: string;
}
export interface NormalHighlightRange {
    textType: "normal";
    hlId: number;
    line: number;
    startCol: number;
    endCol: number;
}
export interface VirtualHighlightRange {
    textType: "virtual";
    highlights: Highlight[];
    line: number;
    col: number;
}
export type HighlightRange = NormalHighlightRange | VirtualHighlightRange;
