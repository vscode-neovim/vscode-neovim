import { NeovimClient } from "neovim";

import { assertLogs, attachTestNvimClient, closeAllActiveEditors, closeNvimClient } from "./integrationUtils";

describe("startup", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });

    it("logs the Nvim it resolved", async () => {
        await assertLogs([/Found Nvim( \(user-configured\))?:/]);
    });

    it("logs the command line it spawned", async () => {
        await assertLogs([/Starting: .*nvim/, /--embed/, /--cmd .*vscode-neovim\.vim/]);
    });

    it("logs the Nvim version it connected to", async () => {
        await assertLogs([/Nvim info/, /nvimVersion:/, /configDir:/]);
    });
});
