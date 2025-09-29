import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import { dedent } from "../../util/dedent";
import { getTestIssueKeys } from "./util";

void describe(relative(cwd(), __filename), () => {
    void describe(getTestIssueKeys.name, () => {
        void it("extracts single test issue keys", () => {
            assert.deepStrictEqual(getTestIssueKeys("this is CYP-123 a test", "CYP"), ["CYP-123"]);
        });

        void it("extracts multiple test issue keys", () => {
            assert.deepStrictEqual(
                getTestIssueKeys("CYP-123 this is a CYP-456 test CYP-789", "CYP"),
                ["CYP-123", "CYP-456", "CYP-789"]
            );
        });

        void it("logs warnings for missing test issue keys", () => {
            assert.throws(() => getTestIssueKeys("this is a test", "CYP"), {
                message: dedent(`
                    Test: this is a test

                      No test issue keys found in title.

                      You can target existing test issues by adding a corresponding issue key:

                        it("CYP-123 this is a test", () => {
                          // ...
                        });

                      For more information, visit:
                      - https://csvtuda.github.io/docs/cypress-xray-plugin/guides/targetingExistingIssues/
                `),
            });
        });
    });
});
