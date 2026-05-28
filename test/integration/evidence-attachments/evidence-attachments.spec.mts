import assert from "node:assert";
import { join, relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import { runCypress } from "../../sh.mjs";
import {
    JIRA_CLIENT_CLOUD,
    JIRA_CLIENT_SERVER,
    XRAY_CLIENT_CLOUD,
    XRAY_CLIENT_SERVER,
} from "../clients.mjs";
import {
    getCreatedTestExecutionIssueKey,
    searchIssues,
    shouldRunIntegrationTests,
} from "../util.mjs";

void describe(relative(cwd(), import.meta.filename), { timeout: 180000 }, () => {
    if (shouldRunIntegrationTests("cloud")) {
        for (const testCase of [
            {
                linkedTest: "CXP-579",
                projectDirectory: join(import.meta.dirname, "cloud"),
                projectKey: "CXP",
                title: "evidence attachments using tasks (cloud)",
            },
        ] as const) {
            void it(testCase.title, async (context) => {
                const output = runCypress(testCase.projectDirectory, {
                    expectedStatusCode: 0,
                    includeDefaultEnv: "cloud",
                });

                const testExecutionIssueKey = getCreatedTestExecutionIssueKey(
                    testCase.projectKey,
                    output,
                    "cypress"
                );
                const [executionIssue, testIssue] = await searchIssues(
                    JIRA_CLIENT_CLOUD,
                    [testExecutionIssueKey, testCase.linkedTest],
                    { logger: context.diagnostic.bind(context), fields: ["id"] }
                );
                const testResults = await XRAY_CLIENT_CLOUD.graphql.getTestRuns(
                    {
                        limit: 1,
                        testExecIssueIds: [executionIssue.id],
                        testIssueIds: [testIssue.id],
                    },
                    (testRunResults) => [
                        testRunResults.results((testRun) => [
                            testRun.evidence((evidence) => [evidence.filename]),
                        ]),
                    ]
                );
                assert.deepStrictEqual(testResults.results?.[0]?.evidence, [
                    { filename: "hello.txt" },
                    { filename: "goodbye.txt" },
                ]);
            });
        }
    }

    if (shouldRunIntegrationTests("server")) {
        for (const testCase of [
            {
                linkedTest: "CYPLUG-2932",
                projectDirectory: join(import.meta.dirname, "server"),
                projectKey: "CYPLUG",
                title: "evidence attachments using tasks (server)",
            },
        ] as const) {
            void it(testCase.title, async (context) => {
                const output = runCypress(testCase.projectDirectory, {
                    expectedStatusCode: 0,
                    includeDefaultEnv: "server",
                });

                const testExecutionIssueKey = getCreatedTestExecutionIssueKey(
                    testCase.projectKey,
                    output,
                    "cypress"
                );

                // Asserts the new execution issue exists.
                await searchIssues(
                    JIRA_CLIENT_SERVER,
                    [testExecutionIssueKey, testCase.linkedTest],
                    { logger: context.diagnostic.bind(context) }
                );
                const testRun = await XRAY_CLIENT_SERVER.testRun.getTestRun({
                    testExecIssueKey: testExecutionIssueKey,
                    testIssueKey: testCase.linkedTest,
                });

                assert.deepStrictEqual(
                    testRun.evidences.map((evidence) => evidence.fileName),
                    ["hello.txt", "goodbye.txt"]
                );
            });
        }
    }
});
