import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import type { HasGetFieldsEndpoint } from "../../../../client/jira/jira-client";
import { LOG } from "../../../../util/logging";
import { FetchAllFieldsCommand } from "./fetch-all-fields-command";

void describe(relative(cwd(), __filename), () => {
    void describe(FetchAllFieldsCommand.name, () => {
        void it("fetches fields", async () => {
            const fields = [
                {
                    clauseNames: ["labels"],
                    custom: false,
                    id: "labels",
                    name: "Labels",
                    navigable: true,
                    orderable: true,
                    schema: { items: "string", system: "labels", type: "array" },
                    searchable: true,
                },
                {
                    clauseNames: ["cf[12126]", "Test Plan"],
                    custom: true,
                    id: "customfield_12126",
                    name: "Test Plan",
                    navigable: true,
                    orderable: true,
                    schema: {
                        custom: "com.xpandit.plugins.xray:test-plan-custom-field",
                        customId: 12126,
                        type: "array",
                    },
                    searchable: true,
                },
            ];
            const client: HasGetFieldsEndpoint = {
                async getFields() {
                    return await Promise.resolve(fields);
                },
            };
            const command = new FetchAllFieldsCommand({ client: client }, LOG);
            assert.deepStrictEqual(await command.compute(), fields);
        });
    });
});
