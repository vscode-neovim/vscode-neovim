export interface NeovimExtensionRequestProcessable {
    handleExtensionRequest(name: string, args: unknown[]): Promise<void>;
}

export interface NeovimCommandProcessable {
    handleVSCodeCommand(command: string, args: unknown[]): Promise<unknown>;
}
