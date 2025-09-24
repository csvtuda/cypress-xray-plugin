import assert from "node:assert";
import fs from "node:fs";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import type {
    HasImportExecutionCucumberMultipartEndpoint,
    HasImportExecutionMultipartEndpoint,
} from "../../../../client/xray/xray-client";
import { PluginEventEmitter } from "../../../../context";
import type { CucumberMultipartFeature } from "../../../../types/xray/requests/import-execution-cucumber-multipart";
import type { MultipartInfo } from "../../../../types/xray/requests/import-execution-multipart-info";
import { LOG } from "../../../../util/logging";
import { ConstantCommand } from "../constant-command";
import { ImportExecutionCucumberCommand } from "./import-execution-cucumber-command";

void describe(relative(cwd(), __filename), () => {
    void describe(ImportExecutionCucumberCommand.name, () => {
        void it("imports cucumber multipart", async (context) => {
            const message = context.mock.method(LOG, "message", context.mock.fn());
            const multipart = {
                features: JSON.parse(
                    fs.readFileSync(
                        "./test/resources/fixtures/xray/requests/importExecutionCucumberMultipartCloud.json",
                        "utf-8"
                    )
                ) as CucumberMultipartFeature[],
                info: JSON.parse(
                    fs.readFileSync(
                        "./test/resources/fixtures/xray/requests/importExecutionCucumberMultipartInfoCloud.json",
                        "utf-8"
                    )
                ) as MultipartInfo,
            };
            const client: HasImportExecutionCucumberMultipartEndpoint = {
                importExecutionCucumberMultipart(cucumberJson, cucumberInfo) {
                    if (cucumberJson === multipart.features && cucumberInfo === multipart.info) {
                        return Promise.resolve("CYP-123");
                    }
                    return Promise.reject(new Error("Mock called unexpectedly"));
                },
            };
            const command = new ImportExecutionCucumberCommand(
                {
                    client: client,
                    emitter: new PluginEventEmitter(),
                },
                LOG,
                new ConstantCommand(LOG, multipart)
            );
            assert.strictEqual(await command.compute(), "CYP-123");
            assert.strictEqual(message.mock.callCount(), 0);
        });

        void it("emits the upload event", async () => {
            const multipart = {
                features: JSON.parse(
                    fs.readFileSync(
                        "./test/resources/fixtures/xray/requests/importExecutionCucumberMultipartCloud.json",
                        "utf-8"
                    )
                ) as CucumberMultipartFeature[],
                info: JSON.parse(
                    fs.readFileSync(
                        "./test/resources/fixtures/xray/requests/importExecutionCucumberMultipartInfoCloud.json",
                        "utf-8"
                    )
                ) as MultipartInfo,
            };
            const client: HasImportExecutionMultipartEndpoint &
                HasImportExecutionCucumberMultipartEndpoint = {
                importExecutionCucumberMultipart() {
                    return Promise.resolve("CYP-123");
                },
                importExecutionMultipart() {
                    return Promise.resolve("CYP-123");
                },
            };
            const emitter = new PluginEventEmitter();
            let payload = {};
            emitter.on("upload:cucumber", (data) => {
                payload = data;
            });
            const command = new ImportExecutionCucumberCommand(
                {
                    client: client,
                    emitter: emitter,
                },
                LOG,
                new ConstantCommand(LOG, multipart)
            );
            await command.compute();
            assert.deepStrictEqual(payload, {
                results: multipart,
                testExecutionIssueKey: "CYP-123",
            });
        });
    });
});
