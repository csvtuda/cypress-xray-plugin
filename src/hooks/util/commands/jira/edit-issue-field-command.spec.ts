import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import type { HasEditIssueEndpoint } from "../../../../client/jira/jira-client";
import { dedent } from "../../../../util/dedent";
import { LOG } from "../../../../util/logging";
import { ConstantCommand } from "../constant-command";
import { EditIssueFieldCommand } from "./edit-issue-field-command";

void describe(relative(cwd(), __filename), () => {
    void describe(EditIssueFieldCommand.name, () => {
        void it("edits issues", async (context) => {
            const message = context.mock.method(LOG, "message", context.mock.fn());
            const client: HasEditIssueEndpoint = {
                editIssue(issueIdOrKey, issueUpdateData) {
                    if (
                        issueIdOrKey === "CYP-123" &&
                        issueUpdateData.fields &&
                        issueUpdateData.fields.customfield_12345 === "hello"
                    ) {
                        return Promise.resolve("CYP-123");
                    }
                    if (
                        issueIdOrKey === "CYP-456" &&
                        issueUpdateData.fields &&
                        issueUpdateData.fields.customfield_12345 === "there"
                    ) {
                        return Promise.resolve("CYP-456");
                    }
                    throw new Error("Mock called unexpectedly");
                },
            };
            const command = new EditIssueFieldCommand(
                {
                    client: client,
                    fieldId: "summary",
                },
                LOG,
                new ConstantCommand(LOG, "customfield_12345"),
                new ConstantCommand(LOG, {
                    ["CYP-123"]: "hello",
                    ["CYP-456"]: "there",
                })
            );
            assert.deepStrictEqual(await command.compute(), ["CYP-123", "CYP-456"]);
            assert.strictEqual(message.mock.callCount(), 0);
        });

        void it("logs errors for unsuccessful edits", async (context) => {
            const message = context.mock.method(LOG, "message", context.mock.fn());
            const client: HasEditIssueEndpoint = {
                editIssue(issueIdOrKey, issueUpdateData) {
                    if (
                        issueIdOrKey === "CYP-123" &&
                        issueUpdateData.fields &&
                        (issueUpdateData.fields.customfield_12345 as string[])[0] === "dev" &&
                        (issueUpdateData.fields.customfield_12345 as string[])[1] === "test"
                    ) {
                        return Promise.resolve("CYP-123");
                    }
                    if (
                        issueIdOrKey === "CYP-123" &&
                        issueUpdateData.fields &&
                        (issueUpdateData.fields.customfield_12345 as string[])[0] === "test"
                    ) {
                        new Error("No editing allowed");
                    }
                    throw new Error("Mock called unexpectedly");
                },
            };
            const command = new EditIssueFieldCommand(
                {
                    client: client,
                    fieldId: "labels",
                },
                LOG,
                new ConstantCommand(LOG, "customfield_12345"),
                new ConstantCommand(LOG, {
                    ["CYP-123"]: ["dev", "test"],
                    ["CYP-456"]: ["test"],
                })
            );
            assert.deepStrictEqual(await command.compute(), ["CYP-123"]);
            assert.deepStrictEqual(message.mock.calls[0].arguments, [
                "warning",
                dedent(`
                    CYP-456

                      Failed to set labels field to value: ["test"]
                `),
            ]);
        });

        void it("returns empty arrays", async (context) => {
            const message = context.mock.method(LOG, "message", context.mock.fn());
            const client: HasEditIssueEndpoint = {
                editIssue() {
                    throw new Error("Mock called unexpectedly");
                },
            };
            const command = new EditIssueFieldCommand(
                {
                    client: client,
                    fieldId: "labels",
                },
                LOG,
                new ConstantCommand(LOG, "customfield_12345"),
                new ConstantCommand(LOG, {})
            );
            assert.deepStrictEqual(await command.compute(), []);
            assert.strictEqual(message.mock.callCount(), 0);
        });
    });
});
