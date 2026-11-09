import { strict as assert } from "assert";

import { joinMsgChunks } from "../../../utils/text";

interface TestCase {
    name: string;
    content?: [attrId: number, chunk: string][];
    expected: string;
}

describe("joinMsgChunks", () => {
    const cases: TestCase[] = [
        { name: "returns an empty string when content is missing", content: undefined, expected: "" },
        { name: "returns an empty string when content is an empty array", content: [], expected: "" },
        { name: "returns the text when there is a single chunk", content: [[0, "chunk"]], expected: "chunk" },
        {
            name: "joins several chunks in order",
            content: [
                [0, "chunk1"],
                [1, "chunk2"],
            ],
            expected: "chunk1chunk2",
        },
    ];

    cases.forEach(({ name, content, expected }) => {
        it(name, () => {
            assert.equal(joinMsgChunks(content), expected);
        });
    });
});
