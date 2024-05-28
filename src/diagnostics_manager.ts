import { languages, Disposable, DiagnosticChangeEvent, Uri, window, DiagnosticSeverity } from "vscode";

import { disposeAll } from "./utils";
import { createLogger } from "./logger";
import { MainController } from "./main_controller";
import actions from "./actions";

const logger = createLogger("DiagnosticManager");

export class DiagnosticsManager implements Disposable {
    private disposables: Disposable[] = [];

    constructor(private main: MainController) {
        this.disposables.push(languages.onDidChangeDiagnostics((event) => this.onDiagnostic(event)));
    }

    dispose(): void {
        disposeAll(this.disposables);
    }

    private onDiagnostic(event: DiagnosticChangeEvent): void {
        const activeEditor = window.activeTextEditor?.document;
        if (!activeEditor) {
            logger.info("Skipping diagnostics, no active editor");
            return;
        }

        const bufferNumber = this.main.bufferManager.getBufferIdForTextDocument(activeEditor);
        if (!bufferNumber) {
            logger.info(`Skipping diagnostics, no editor found for active editor with uri ${activeEditor.uri}`);
            return;
        }

        // logger.debug(`Got diagnostics ${activeEditor}, ${event.uris}, ${event.uris.includes(activeEditor!)}`);
        event.uris
            .filter((uri) => uri.toString() === activeEditor.uri.toString())
            .forEach((uri: Uri) => {
                this.syncDiagnostics(uri, bufferNumber);
            });
    }

    private syncDiagnostics(documentURI: Uri, bufferNumber: number): void {
        logger.info(`Syncing diagnostics for ${documentURI} ${bufferNumber}`);
        const diagnostics = languages.getDiagnostics(documentURI).map((diagnostic) => ({
            // TODO: Be more intelligent about this
            line: diagnostic.range.start.line,
            message: diagnostic.message,
            severity: this.nvimSeverityFromVSCodeSeverity(diagnostic.severity),
        }));

        actions.lua("set_diagnostics", bufferNumber, diagnostics).catch((e) => {
            logger.error("Failed to run set_diagnostics:", e);
        });
    }

    private nvimSeverityFromVSCodeSeverity(severity: DiagnosticSeverity): number {
        return (severity as number) + 1;
    }
}
