import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import type { HasImportFeatureEndpoint } from "../../../../client/xray/xray-client";
import { dedent } from "../../../../util/dedent";
import { LOG } from "../../../../util/logging";
import { ImportFeatureCommand } from "./import-feature-command";

void describe(relative(cwd(), __filename), () => {
    void describe(ImportFeatureCommand.name, () => {
        void it("imports features", async (context) => {
            const message = context.mock.method(LOG, "message", context.mock.fn());
            const client: HasImportFeatureEndpoint = {
                importFeature() {
                    return Promise.resolve({
                        errors: [],
                        updatedOrCreatedIssues: ["CYP-123", "CYP-42"],
                    });
                },
            };
            const command = new ImportFeatureCommand(
                {
                    client: client,
                    filePath: "/path/to/some/cucumber.feature",
                },
                LOG
            );
            assert.deepStrictEqual(await command.compute(), {
                errors: [],
                updatedOrCreatedIssues: ["CYP-123", "CYP-42"],
            });
            assert.deepStrictEqual(message.mock.calls[0].arguments, [
                "info",
                "Importing feature file to Xray: /path/to/some/cucumber.feature",
            ]);
        });

        void it("warns about import errors", async (context) => {
            const message = context.mock.method(LOG, "message", context.mock.fn());
            const client: HasImportFeatureEndpoint = {
                importFeature() {
                    return Promise.resolve({
                        errors: ["CYP-123 does not exist", "CYP-42: Access denied", "Big\nProblem"],
                        updatedOrCreatedIssues: [],
                    });
                },
            };
            const command = new ImportFeatureCommand(
                {
                    client: client,
                    filePath: "/path/to/some/cucumber.feature",
                },
                LOG
            );
            await command.compute();
            assert.deepStrictEqual(message.mock.calls[1].arguments, [
                "warning",
                dedent(`
                    /path/to/some/cucumber.feature

                      Encountered errors during feature file import:
                      - CYP-123 does not exist
                      - CYP-42: Access denied
                      - Big\nProblem
                `),
            ]);
        });
    });
});
