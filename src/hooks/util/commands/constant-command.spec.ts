import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import { LOG } from "../../../util/logging";
import { ConstantCommand } from "./constant-command";

void describe(relative(cwd(), __filename), () => {
    void describe(ConstantCommand.name, () => {
        void it("returns the value", async (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const command = new ConstantCommand(LOG, {
                a: 10,
                b: 20,
            });
            assert.deepStrictEqual(await command.compute(), {
                a: 10,
                b: 20,
            });
        });
    });
});
