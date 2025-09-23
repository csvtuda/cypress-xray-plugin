import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import { LOG } from "../../../util/logging";
import { ComputableState } from "../../command";
import { ConstantCommand } from "./constant-command";
import { FallbackCommand } from "./fallback-command";

void describe(relative(cwd(), __filename), () => {
    void describe(FallbackCommand.name, () => {
        void it("computes the result if possible", async (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const input = new ConstantCommand(LOG, 42);
            const command = new FallbackCommand(
                {
                    fallbackOn: [ComputableState.FAILED],
                    fallbackValue: "fallback",
                },
                LOG,
                input
            );
            assert.strictEqual(await command.compute(), 42);
        });

        void it("returns the fallback value", async (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const input = new ConstantCommand(LOG, 42);
            const command = new FallbackCommand(
                {
                    fallbackOn: [ComputableState.FAILED],
                    fallbackValue: "fallback",
                },
                LOG,
                input
            );
            input.setState(ComputableState.FAILED);
            assert.strictEqual(await command.compute(), "fallback");
        });
    });
});
