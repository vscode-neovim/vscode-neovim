export interface NeovimRedrawProcessable {
    handleRedrawBatch(batch: [string, ...unknown[]][]): void;
}

export interface NeovimExtensionRequestProcessable {
    handleExtensionRequest(name: string, args: unknown[]): Promise<void>;
}

export interface NeovimCommandProcessable {
    handleVSCodeCommand(command: string, args: unknown[]): Promise<unknown>;
}

export interface NeovimRangeCommandProcessable {
    handleVSCodeRangeCommand(
        command: string,
        line1: number,
        line2: number,
        pos1: number,
        pos2: number,
        leaveSelection: boolean,
        args: unknown[],
    ): Promise<unknown>;
}
