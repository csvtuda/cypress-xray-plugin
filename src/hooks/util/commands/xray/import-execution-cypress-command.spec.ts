import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import type { HasImportExecutionMultipartEndpoint } from "../../../../client/xray/xray-client";
import type {
    HasAddEvidenceToTestRunEndpoint,
    HasGetTestRunResultsEndpoint,
} from "../../../../client/xray/xray-client-cloud";
import type {
    HasAddEvidenceEndpoint,
    HasGetTestRunEndpoint,
} from "../../../../client/xray/xray-client-server";
import { PluginEventEmitter } from "../../../../context";
import type { XrayTestExecutionResults } from "../../../../types/xray/import-test-execution-results";
import type { MultipartInfo } from "../../../../types/xray/requests/import-execution-multipart-info";
import type { GetTestRunResponseServer } from "../../../../types/xray/responses/graphql/get-test-runs";
import { LOG } from "../../../../util/logging";
import { ConstantCommand } from "../constant-command";
import { ImportExecutionCypressCommand } from "./import-execution-cypress-command";

void describe(relative(cwd(), __filename), () => {
    void describe(ImportExecutionCypressCommand.name, () => {
        void it("imports cypress xray json", async (context) => {
            const message = context.mock.method(LOG, "message", context.mock.fn());
            const results: XrayTestExecutionResults = {
                info: { description: "Hello", summary: "Test Execution Summary" },
                testExecutionKey: "CYP-123",
                tests: [
                    { status: "PASSED" },
                    { status: "PASSED" },
                    { status: "PASSED" },
                    { status: "FAILED" },
                ],
            };
            const info: MultipartInfo = {
                fields: {
                    issuetype: {
                        id: "10008",
                    },
                    labels: ["a", "b"],
                    project: {
                        key: "CYP",
                    },
                    summary: "Brand new Test execution",
                },
            };
            const command = new ImportExecutionCypressCommand(
                {
                    client: {
                        addEvidence() {
                            throw new Error("Mock called unexpectedly");
                        },
                        getTestRun() {
                            throw new Error("Mock called unexpectedly");
                        },
                        importExecutionMultipart(executionResults, executionInfo) {
                            if (executionResults === results && executionInfo === info) {
                                return Promise.resolve("CYP-123");
                            }
                            return Promise.reject(new Error("Mock called unexpectedly"));
                        },
                    },
                    emitter: new PluginEventEmitter(),
                    splitUpload: false,
                },
                LOG,
                new ConstantCommand(LOG, [results, info])
            );
            assert.strictEqual(await command.compute(), "CYP-123");
            assert.strictEqual(message.mock.callCount(), 0);
        });

        void describe("splits evidence uploads into multiple requests", () => {
            void it("server", async (context) => {
                const message = context.mock.method(LOG, "message", context.mock.fn());
                const results: XrayTestExecutionResults = {
                    info: { description: "Hello", summary: "Test Execution Summary" },
                    testExecutionKey: "CYP-123",
                    tests: [
                        {
                            evidence: [
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("first").toString("base64"),
                                    filename: "first.txt",
                                },
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("second").toString("base64"),
                                    filename: "second.txt",
                                },
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("third").toString("base64"),
                                    filename: "third.txt",
                                },
                            ],
                            status: "PASSED",
                            testKey: "CYP-456",
                        },
                    ],
                };
                const info: MultipartInfo = {
                    fields: {
                        issuetype: {
                            id: "10008",
                        },
                        project: {
                            key: "CYP",
                        },
                        summary: "Brand new Test execution",
                    },
                };
                const importExecutionMultipartCallArgs: Parameters<
                    HasImportExecutionMultipartEndpoint["importExecutionMultipart"]
                >[] = [];
                const getTestRunCallArgs: Parameters<HasGetTestRunEndpoint["getTestRun"]>[] = [];
                const addEvidenceCallArgs: Parameters<HasAddEvidenceEndpoint["addEvidence"]>[] = [];
                const command = new ImportExecutionCypressCommand(
                    {
                        client: {
                            addEvidence(testRunId, body) {
                                addEvidenceCallArgs.push([testRunId, body]);
                                return Promise.resolve();
                            },
                            getTestRun(testRun) {
                                getTestRunCallArgs.push([testRun]);
                                return Promise.resolve({
                                    id: "123456789",
                                } as unknown as GetTestRunResponseServer);
                            },
                            importExecutionMultipart(executionResults, executionInfo) {
                                importExecutionMultipartCallArgs.push([
                                    executionResults,
                                    executionInfo,
                                ]);
                                return Promise.resolve("CYP-123");
                            },
                        },
                        emitter: new PluginEventEmitter(),
                        splitUpload: true,
                    },
                    LOG,
                    new ConstantCommand(LOG, [results, info])
                );
                assert.strictEqual(await command.compute(), "CYP-123");
                assert.strictEqual(message.mock.callCount(), 0);
                assert.deepStrictEqual(importExecutionMultipartCallArgs, [
                    [
                        {
                            info: { description: "Hello", summary: "Test Execution Summary" },
                            testExecutionKey: "CYP-123",
                            tests: [{ status: "PASSED", testKey: "CYP-456" }],
                        },
                        {
                            fields: {
                                issuetype: { id: "10008" },
                                project: { key: "CYP" },
                                summary: "Brand new Test execution",
                            },
                        },
                    ],
                ]);
                assert.deepStrictEqual(getTestRunCallArgs, [
                    [{ testExecIssueKey: "CYP-123", testIssueKey: "CYP-456" }],
                ]);
                assert.deepStrictEqual(addEvidenceCallArgs, [
                    [
                        "123456789",
                        { contentType: "text/plain", data: "Zmlyc3Q=", filename: "first.txt" },
                    ],
                    [
                        "123456789",
                        { contentType: "text/plain", data: "c2Vjb25k", filename: "second.txt" },
                    ],
                    [
                        "123456789",
                        { contentType: "text/plain", data: "dGhpcmQ=", filename: "third.txt" },
                    ],
                ]);
            });

            void it("cloud", async (context) => {
                const message = context.mock.method(LOG, "message", context.mock.fn());
                const results: XrayTestExecutionResults = {
                    info: { description: "Hello", summary: "Test Execution Summary" },
                    testExecutionKey: "CYP-123",
                    tests: [
                        {
                            evidence: [
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("first").toString("base64"),
                                    filename: "first.txt",
                                },
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("second").toString("base64"),
                                    filename: "second.txt",
                                },
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("third").toString("base64"),
                                    filename: "third.txt",
                                },
                            ],
                            status: "PASSED",
                            testKey: "CYP-456",
                        },
                    ],
                };
                const info: MultipartInfo = {
                    fields: {
                        issuetype: {
                            id: "10008",
                        },
                        project: {
                            key: "CYP",
                        },
                        summary: "Brand new Test execution",
                    },
                };
                const importExecutionMultipartCallArgs: Parameters<
                    HasImportExecutionMultipartEndpoint["importExecutionMultipart"]
                >[] = [];
                const getTestRunResultsCallArgs: Parameters<
                    HasGetTestRunResultsEndpoint["getTestRunResults"]
                >[] = [];
                const addEvidenceToTestRunCallArgs: Parameters<
                    HasAddEvidenceToTestRunEndpoint["addEvidenceToTestRun"]
                >[] = [];
                const command = new ImportExecutionCypressCommand(
                    {
                        client: {
                            addEvidenceToTestRun(variables) {
                                addEvidenceToTestRunCallArgs.push([variables]);
                                return Promise.resolve({ addedEvidence: [], warnings: [] });
                            },
                            getTestRunResults(options) {
                                getTestRunResultsCallArgs.push([options]);
                                return Promise.resolve([{ id: "123456789" }]);
                            },
                            importExecutionMultipart(executionResults, executionInfo) {
                                importExecutionMultipartCallArgs.push([
                                    executionResults,
                                    executionInfo,
                                ]);
                                return Promise.resolve("CYP-123");
                            },
                        },
                        emitter: new PluginEventEmitter(),
                        splitUpload: true,
                    },
                    LOG,
                    new ConstantCommand(LOG, [results, info])
                );
                assert.strictEqual(await command.compute(), "CYP-123");
                assert.strictEqual(message.mock.callCount(), 0);
                assert.deepStrictEqual(importExecutionMultipartCallArgs, [
                    [
                        {
                            info: { description: "Hello", summary: "Test Execution Summary" },
                            testExecutionKey: "CYP-123",
                            tests: [{ status: "PASSED", testKey: "CYP-456" }],
                        },
                        {
                            fields: {
                                issuetype: { id: "10008" },
                                project: { key: "CYP" },
                                summary: "Brand new Test execution",
                            },
                        },
                    ],
                ]);
                assert.deepStrictEqual(getTestRunResultsCallArgs, [
                    [{ testExecIssueIds: ["CYP-123"], testIssueIds: ["CYP-456"] }],
                ]);
                assert.deepStrictEqual(addEvidenceToTestRunCallArgs, [
                    [
                        {
                            evidence: [
                                {
                                    contentType: "text/plain",
                                    data: "Zmlyc3Q=",
                                    filename: "first.txt",
                                },
                            ],
                            id: "123456789",
                        },
                    ],
                    [
                        {
                            evidence: [
                                {
                                    contentType: "text/plain",
                                    data: "c2Vjb25k",
                                    filename: "second.txt",
                                },
                            ],
                            id: "123456789",
                        },
                    ],
                    [
                        {
                            evidence: [
                                {
                                    contentType: "text/plain",
                                    data: "dGhpcmQ=",
                                    filename: "third.txt",
                                },
                            ],
                            id: "123456789",
                        },
                    ],
                ]);
            });
        });

        void it("emits the upload event", async () => {
            const results: XrayTestExecutionResults = {
                info: { description: "Hello", summary: "Test Execution Summary" },
                testExecutionKey: "CYP-123",
                tests: [{ status: "PASSED", testKey: "CYP-456" }],
            };
            const info: MultipartInfo = {
                fields: {
                    issuetype: { id: "10008" },
                    project: { key: "CYP" },
                    summary: "Brand new Test execution",
                },
            };
            const emitter = new PluginEventEmitter();
            let payload = {};
            emitter.on("upload:cypress", (data) => {
                payload = data;
            });
            const command = new ImportExecutionCypressCommand(
                {
                    client: {
                        addEvidence() {
                            throw new Error("Mock called unexpectedly");
                        },
                        getTestRun() {
                            throw new Error("Mock called unexpectedly");
                        },
                        importExecutionMultipart() {
                            return Promise.resolve("CYP-123");
                        },
                    },
                    emitter: emitter,
                    splitUpload: false,
                },
                LOG,
                new ConstantCommand(LOG, [results, info])
            );
            await command.compute();
            assert.deepStrictEqual(payload, {
                info: {
                    fields: {
                        issuetype: { id: "10008" },
                        project: { key: "CYP" },
                        summary: "Brand new Test execution",
                    },
                },
                results: {
                    info: { description: "Hello", summary: "Test Execution Summary" },
                    testExecutionKey: "CYP-123",
                    tests: [{ status: "PASSED", testKey: "CYP-456" }],
                },
                testExecutionIssueKey: "CYP-123",
            });
        });

        void describe("splits evidence uploads into multiple sequential requests", () => {
            void it("server", async (context) => {
                const message = context.mock.method(LOG, "message", context.mock.fn());
                const results: XrayTestExecutionResults = {
                    info: { description: "Hello", summary: "Test Execution Summary" },
                    testExecutionKey: "CYP-123",
                    tests: [
                        {
                            evidence: [
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("first").toString("base64"),
                                    filename: "first.txt",
                                },
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("second").toString("base64"),
                                    filename: "second.txt",
                                },
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("third").toString("base64"),
                                    filename: "third.txt",
                                },
                            ],
                            status: "PASSED",
                            testKey: "CYP-456",
                        },
                    ],
                };
                const info: MultipartInfo = {
                    fields: {
                        issuetype: {
                            id: "10008",
                        },
                        project: {
                            key: "CYP",
                        },
                        summary: "Brand new Test execution",
                    },
                };
                const importExecutionMultipartCallArgs: Parameters<
                    HasImportExecutionMultipartEndpoint["importExecutionMultipart"]
                >[] = [];
                const getTestRunCallArgs: Parameters<HasGetTestRunEndpoint["getTestRun"]>[] = [];
                const addEvidenceCallArgs: Parameters<HasAddEvidenceEndpoint["addEvidence"]>[] = [];
                const command = new ImportExecutionCypressCommand(
                    {
                        client: {
                            addEvidence(testRunId, body) {
                                addEvidenceCallArgs.push([testRunId, body]);
                                return Promise.resolve();
                            },
                            getTestRun(testRun) {
                                getTestRunCallArgs.push([testRun]);
                                return Promise.resolve({
                                    id: "123456789",
                                } as unknown as GetTestRunResponseServer);
                            },
                            importExecutionMultipart(executionResults, executionInfo) {
                                importExecutionMultipartCallArgs.push([
                                    executionResults,
                                    executionInfo,
                                ]);
                                return Promise.resolve("CYP-123");
                            },
                        },
                        emitter: new PluginEventEmitter(),
                        splitUpload: "sequential",
                    },
                    LOG,
                    new ConstantCommand(LOG, [results, info])
                );
                assert.strictEqual(await command.compute(), "CYP-123");
                assert.strictEqual(message.mock.callCount(), 0);
                assert.deepStrictEqual(importExecutionMultipartCallArgs, [
                    [
                        {
                            info: { description: "Hello", summary: "Test Execution Summary" },
                            testExecutionKey: "CYP-123",
                            tests: [{ status: "PASSED", testKey: "CYP-456" }],
                        },
                        {
                            fields: {
                                issuetype: { id: "10008" },
                                project: { key: "CYP" },
                                summary: "Brand new Test execution",
                            },
                        },
                    ],
                ]);
                assert.deepStrictEqual(getTestRunCallArgs, [
                    [{ testExecIssueKey: "CYP-123", testIssueKey: "CYP-456" }],
                ]);
                assert.deepStrictEqual(addEvidenceCallArgs, [
                    [
                        "123456789",
                        { contentType: "text/plain", data: "Zmlyc3Q=", filename: "first.txt" },
                    ],
                    [
                        "123456789",
                        { contentType: "text/plain", data: "c2Vjb25k", filename: "second.txt" },
                    ],
                    [
                        "123456789",
                        { contentType: "text/plain", data: "dGhpcmQ=", filename: "third.txt" },
                    ],
                ]);
            });

            void it("cloud", async (context) => {
                const message = context.mock.method(LOG, "message", context.mock.fn());
                const results: XrayTestExecutionResults = {
                    info: { description: "Hello", summary: "Test Execution Summary" },
                    testExecutionKey: "CYP-123",
                    tests: [
                        {
                            evidence: [
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("first").toString("base64"),
                                    filename: "first.txt",
                                },
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("second").toString("base64"),
                                    filename: "second.txt",
                                },
                                {
                                    contentType: "text/plain",
                                    data: Buffer.from("third").toString("base64"),
                                    filename: "third.txt",
                                },
                            ],
                            status: "PASSED",
                            testKey: "CYP-456",
                        },
                    ],
                };
                const info: MultipartInfo = {
                    fields: {
                        issuetype: {
                            id: "10008",
                        },
                        project: {
                            key: "CYP",
                        },
                        summary: "Brand new Test execution",
                    },
                };
                const importExecutionMultipartCallArgs: Parameters<
                    HasImportExecutionMultipartEndpoint["importExecutionMultipart"]
                >[] = [];
                const getTestRunResultsCallArgs: Parameters<
                    HasGetTestRunResultsEndpoint["getTestRunResults"]
                >[] = [];
                const addEvidenceToTestRunCallArgs: Parameters<
                    HasAddEvidenceToTestRunEndpoint["addEvidenceToTestRun"]
                >[] = [];
                const command = new ImportExecutionCypressCommand(
                    {
                        client: {
                            addEvidenceToTestRun(variables) {
                                addEvidenceToTestRunCallArgs.push([variables]);
                                return Promise.resolve({ addedEvidence: [], warnings: [] });
                            },
                            getTestRunResults(options) {
                                getTestRunResultsCallArgs.push([options]);
                                return Promise.resolve([{ id: "123456789" }]);
                            },
                            importExecutionMultipart(executionResults, executionInfo) {
                                importExecutionMultipartCallArgs.push([
                                    executionResults,
                                    executionInfo,
                                ]);
                                return Promise.resolve("CYP-123");
                            },
                        },
                        emitter: new PluginEventEmitter(),
                        splitUpload: "sequential",
                    },
                    LOG,
                    new ConstantCommand(LOG, [results, info])
                );
                assert.strictEqual(await command.compute(), "CYP-123");
                assert.strictEqual(message.mock.callCount(), 0);
                assert.deepStrictEqual(importExecutionMultipartCallArgs, [
                    [
                        {
                            info: { description: "Hello", summary: "Test Execution Summary" },
                            testExecutionKey: "CYP-123",
                            tests: [{ status: "PASSED", testKey: "CYP-456" }],
                        },
                        {
                            fields: {
                                issuetype: { id: "10008" },
                                project: { key: "CYP" },
                                summary: "Brand new Test execution",
                            },
                        },
                    ],
                ]);
                assert.deepStrictEqual(getTestRunResultsCallArgs, [
                    [{ testExecIssueIds: ["CYP-123"], testIssueIds: ["CYP-456"] }],
                ]);
                assert.deepStrictEqual(addEvidenceToTestRunCallArgs, [
                    [
                        {
                            evidence: [
                                {
                                    contentType: "text/plain",
                                    data: "Zmlyc3Q=",
                                    filename: "first.txt",
                                },
                            ],
                            id: "123456789",
                        },
                    ],
                    [
                        {
                            evidence: [
                                {
                                    contentType: "text/plain",
                                    data: "c2Vjb25k",
                                    filename: "second.txt",
                                },
                            ],
                            id: "123456789",
                        },
                    ],
                    [
                        {
                            evidence: [
                                {
                                    contentType: "text/plain",
                                    data: "dGhpcmQ=",
                                    filename: "third.txt",
                                },
                            ],
                            id: "123456789",
                        },
                    ],
                ]);
            });
        });
    });
});
