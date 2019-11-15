import os from "os";
import path from "path";
import fs from "fs";

import vscode from "vscode";
import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    assertContent,
    wait,
    closeActiveEditor,
} from "../utils";

describe("External changes on file", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
    });

    afterEach(async () => {
        await closeAllActiveEditors();
    });

    it("Multiple replacing/deleting/inserting", async () => {
        const filePath = path.join(os.tmpdir(), Math.random().toString());
        fs.writeFileSync(filePath, ["line 1", "line 2", "line 3", "line 4", "line 5", "line 6", "line 7"].join("\n"), {
            encoding: "utf8",
        });

        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
        await wait(1000);

        await assertContent(
            {
                content: ["line 1", "line 2", "line 3", "line 4", "line 5", "line 6", "line 7"],
            },
            client,
        );

        fs.writeFileSync(
            filePath,
            [
                "line1 changed - line 2 deleted",
                "line 3",
                "line 3.1",
                "line 3.2",
                "line 4",
                "line6",
                "line 6.1",
                "line 7",
                "line 8",
            ].join("\n"),
        );
        await wait(2000);

        await assertContent(
            {
                content: [
                    "line1 changed - line 2 deleted",
                    "line 3",
                    "line 3.1",
                    "line 3.2",
                    "line 4",
                    "line6",
                    "line 6.1",
                    "line 7",
                    "line 8",
                ],
            },
            client,
        );
        await closeActiveEditor(true);
        await wait();
        fs.unlinkSync(filePath);
    });
});
