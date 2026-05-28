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

// ============================================================================================== //
// https://github.com/Qytera-Gmbh/cypress-xray-plugin/issues/450
// ============================================================================================== //

void describe(relative(cwd(), import.meta.filename), { timeout: 180000 }, () => {
    if (shouldRunIntegrationTests("cloud")) {
        for (const testCase of [
            {
                expectedScreenshots: [
                    "CXP-14 screenshot #1.png",
                    "CXP-14 screenshot #2.png",
                    "CXP-14 screenshot #3.png",
                ],
                linkedTest: "CXP-14",
                projectDirectory: join(import.meta.dirname, "cloud"),
                projectKey: "CXP",
                title: "evidence uploads can be split into multiple requests (cloud)",
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
                            testRun.status((status) => [status.name]),
                            testRun.test((test) => [test.jira({ fields: ["key"] })]),
                            testRun.evidence((evidence) => [evidence.filename]),
                        ]),
                    ]
                );
                assert.deepStrictEqual(
                    new Set(testResults.results?.[0]?.evidence?.map((e) => e?.filename)),
                    new Set(testCase.expectedScreenshots)
                );
            });
        }
    }

    if (shouldRunIntegrationTests("server")) {
        for (const testCase of [
            {
                expectedScreenshots: [
                    "CYPLUG-1672 screenshot #1.png",
                    "CYPLUG-1672 screenshot #2.png",
                    "CYPLUG-1672 screenshot #3.png",
                ],
                linkedTest: "CYPLUG-1672",
                projectDirectory: join(import.meta.dirname, "server"),
                projectKey: "CYPLUG",
                title: "evidence uploads can be split into multiple requests (server)",
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
                assert.strictEqual(testRun.evidences.length, 3);
                assert.deepStrictEqual(
                    new Set(testRun.evidences.map((e) => e.fileName)),
                    new Set(testCase.expectedScreenshots)
                );
            });
        }
    }
});
