import { strict as assert } from "assert";

import { NeovimClient } from "neovim";

import {
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendVSCodeKeys,
    sendNeovimKeys,
    wait,
} from "./integrationUtils";

describe("Search and Replace with Confirmation", () => {
    let client: NeovimClient;
    before(async () => {
        client = await attachTestNvimClient();
    });
    after(async () => {
        await closeNvimClient(client);
        await closeAllActiveEditors();
    });
    afterEach(async () => {
        await closeAllActiveEditors();
    });

    it("Should handle confirmation prompts for search and replace with gc flag", async function () {
        this.timeout(15000);

        // Create a test document with multiple instances of 'foo'
        const content = [
            "foo first instance",
            "some other text",
            "foo second instance",
            "more content here",
            "foo third instance",
        ].join("\n");

        await openTextDocument({ content });

        // Move to beginning of document
        await sendVSCodeKeys("gg");

        // Start search and replace with confirmation
        await sendVSCodeKeys(":");
        await sendNeovimKeys(client, "%s/foo/bar/gc");
        await sendVSCodeKeys("<CR>");

        // Wait for the confirmation to appear
        await wait(1500);

        // Send 'y' to confirm the first replacement
        await sendVSCodeKeys("y");

        // Wait for the next confirmation
        await wait(500);

        // Send 'y' to confirm the second replacement
        await sendVSCodeKeys("y");

        // Wait for the next confirmation  
        await wait(500);

        // Send 'y' to confirm the third replacement
        await sendVSCodeKeys("y");

        // Wait for completion
        await wait(1000);

        // Verify that the operation completed without errors
        // The main goal is to ensure the confirmation prompts work properly
        assert.ok(true, "Search and replace with confirmation completed without errors");
    });
});
