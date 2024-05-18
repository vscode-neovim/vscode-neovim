import { strict as assert } from "assert";
import path from "path";

import { NeovimClient } from "neovim";

import {
    assertContent,
    attachTestNvimClient,
    closeAllActiveEditors,
    closeNvimClient,
    openTextDocument,
    sendNeovimKeys,
    sendVSCodeKeys,
} from "./integrationUtils";

describe("Test incsearch", () => {
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
    it("Cursor is ok for incsearch after scroll", async () => {
        const e = await openTextDocument(path.join(__dirname, "../../../test_fixtures/incsearch-scroll.ts"));

        await sendVSCodeKeys("gg");
        await sendVSCodeKeys("/bla");
        await assertContent({ cursor: [115, 19] }, client);
        assert.ok(e.visibleRanges[0].start.line <= 115);
    });

    it("Cursor is ok for incsearch even if register / is not empty", async function () {
        this.retries(1);
        await openTextDocument(path.join(__dirname, "../../../test_fixtures/incsearch-scroll.ts"));

        await sendVSCodeKeys("gg");
        await sendVSCodeKeys("/bla");
        await assertContent({ cursor: [115, 19] }, client);
        await sendNeovimKeys(client, "<cr>");
        await assertContent({ cursor: [115, 16] }, client);
        await sendNeovimKeys(client, "/h2");
        await assertContent({ cursor: [170, 21] }, client);
    });
});
