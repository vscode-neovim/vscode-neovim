import os from "os";
import path from "path";
import fs from "fs";

import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeNvimClient,
    closeAllActiveEditors,
    assertContent,
    wait,
    closeActiveEditor,
    openTextDocument,
} from "../integrationUtils";

describe("External changes in file", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("Multiple replacing/deleting/inserting", async () => {
        const filePath = path.join(os.tmpdir(), Math.random().toString());
        fs.writeFileSync(filePath, ["line 1", "line 2", "line 3", "line 4", "line 5", "line 6", "line 7"].join("\n"), {
            encoding: "utf8",
        });
        await openTextDocument(filePath);

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
        await wait(500);

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
        await closeActiveEditor();
        fs.unlinkSync(filePath);
    });
});
