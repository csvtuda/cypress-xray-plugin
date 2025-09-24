import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import type { HasTransitionIssueEndpoint } from "../../../../client/jira/jira-client";
import { LOG } from "../../../../util/logging";
import { ConstantCommand } from "../constant-command";
import { TransitionIssueCommand } from "./transition-issue-command";

void describe(relative(cwd(), __filename), () => {
    void describe(TransitionIssueCommand.name, () => {
        void it("transitions issues", async (context) => {
            const message = context.mock.method(LOG, "message", context.mock.fn());
            const client: HasTransitionIssueEndpoint = {
                async transitionIssue() {
                    // Nothing.
                },
            };
            const transitionIssue = context.mock.method(client, "transitionIssue");
            const command = new TransitionIssueCommand(
                { client: client, transition: { id: "5" } },
                LOG,
                new ConstantCommand(LOG, "CYP-123")
            );
            await command.compute();
            assert.deepStrictEqual(message.mock.calls[0].arguments, [
                "info",
                "Transitioning test execution issue CYP-123",
            ]);
            assert.deepStrictEqual(transitionIssue.mock.calls[0].arguments, [
                "CYP-123",
                {
                    transition: {
                        id: "5",
                    },
                },
            ]);
        });
    });
});
