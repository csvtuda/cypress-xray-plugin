import assert from "node:assert";
import { randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { describe, it } from "node:test";
import { getMockedCypress } from "../../test/mocks.js";

void describe(path.relative(process.cwd(), import.meta.filename), () => {
    void it("overwrites the cy.request command on import", async (context) => {
        const overwriteSpy = context.mock.fn((name: string) => {
            assert.strictEqual(name, "request");
        });
        getMockedCypress().cypress.Commands.overwrite = overwriteSpy;
        // The query parameter busts the cached module.
        await import(`./commands?xyz=${randomUUID()}`);
        assert.strictEqual(overwriteSpy.mock.callCount(), 1);
    });
});
