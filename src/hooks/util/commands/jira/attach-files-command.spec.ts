import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import type { HasAddAttachmentEndpoint } from "../../../../client/jira/jira-client";
import { LOG } from "../../../../util/logging";
import { ConstantCommand } from "../constant-command";
import { AttachFilesCommand } from "./attach-files-command";

void describe(relative(cwd(), __filename), () => {
    void describe(AttachFilesCommand.name, () => {
        void it("attaches files", async (context) => {
            const message = context.mock.method(LOG, "message", context.mock.fn());
            const client: HasAddAttachmentEndpoint = {
                addAttachment(issueIdOrKey, ...files) {
                    if (
                        issueIdOrKey === "CYP-123" &&
                        files[0] === "image.jpg" &&
                        files[1] === "something.mp4"
                    ) {
                        return Promise.resolve([
                            { filename: "image.jpg", size: 12345 },
                            { filename: "something.mp4", size: 54321 },
                        ]);
                    }
                    throw new Error("Mock called unexpectedly");
                },
            };
            const command = new AttachFilesCommand(
                { client: client },
                LOG,
                new ConstantCommand(LOG, ["image.jpg", "something.mp4"]),
                new ConstantCommand(LOG, "CYP-123")
            );
            assert.deepStrictEqual(await command.compute(), [
                { filename: "image.jpg", size: 12345 },
                { filename: "something.mp4", size: 54321 },
            ]);
            assert.deepStrictEqual(message.mock.calls[0].arguments, [
                "info",
                "Attaching files to test execution issue CYP-123",
            ]);
        });

        void it("does not throw without files to attach", async (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const client: HasAddAttachmentEndpoint = {
                addAttachment() {
                    throw new Error("Mock called unexpectedly");
                },
            };
            const addAttachment = context.mock.method(client, "addAttachment");
            const command = new AttachFilesCommand(
                { client: client },
                LOG,
                new ConstantCommand(LOG, []),
                new ConstantCommand(LOG, "CYP-123")
            );
            assert.deepStrictEqual(await command.compute(), []);
            assert.strictEqual(addAttachment.mock.callCount(), 0);
        });
    });
});
