export interface NeovimCommandProcessable {
    handleVSCodeCommand(command: string, args: unknown[]): Promise<unknown>;
}
