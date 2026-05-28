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
// https://github.com/Qytera-Gmbh/cypress-xray-plugin/issues/451
// ============================================================================================== //

void describe(relative(cwd(), import.meta.filename), { timeout: 180000 }, () => {
    if (shouldRunIntegrationTests("cloud")) {
        for (const testCase of [
            {
                linkedTests: ["CXP-17", "CXP-18"],
                projectDirectory: join(import.meta.dirname, "cloud"),
                projectKey: "CXP",
                title: "only last attempts are uploaded (cloud)",
            },
        ] as const) {
            void it(testCase.title, async (context) => {
                const output = runCypress(testCase.projectDirectory, {
                    expectedStatusCode: 1,
                    includeDefaultEnv: "cloud",
                });

                const testExecutionIssueKey = getCreatedTestExecutionIssueKey(
                    testCase.projectKey,
                    output,
                    "cypress"
                );

                const [executionIssue, testIssueRetried, testIssueRetriedScreenshot] =
                    await searchIssues(
                        JIRA_CLIENT_CLOUD,
                        [testExecutionIssueKey, testCase.linkedTests[0], testCase.linkedTests[1]],
                        { logger: context.diagnostic.bind(context), fields: ["id"] }
                    );
                const testResultsRetried = await XRAY_CLIENT_CLOUD.graphql.getTestRuns(
                    {
                        limit: 1,
                        testExecIssueIds: [executionIssue.id],
                        testIssueIds: [testIssueRetried.id],
                    },
                    (testRunResults) => [
                        testRunResults.results((testRun) => [
                            testRun.status((status) => [status.name]),
                            testRun.test((test) => [test.jira({ fields: ["key"] })]),
                            testRun.evidence((evidence) => [evidence.filename]),
                            testRun.iterations({ limit: 100 }, (testRunIterationResults) => [
                                testRunIterationResults.results((testRunIteration) => [
                                    testRunIteration.status((status) => [status.name]),
                                ]),
                            ]),
                        ]),
                    ]
                );
                assert.partialDeepStrictEqual(testResultsRetried.results, [
                    {
                        status: { name: "PASSED" },
                        test: { jira: { key: testCase.linkedTests[0] } },
                        evidence: [{ filename: "CXP-17 my screenshot (attempt 6).png" }],
                        iterations: { results: [] },
                    },
                ]);
                const testResultsRetriedScreenshot = await XRAY_CLIENT_CLOUD.graphql.getTestRuns(
                    {
                        limit: 1,
                        testExecIssueIds: [executionIssue.id],
                        testIssueIds: [testIssueRetriedScreenshot.id],
                    },
                    (testRunResults) => [
                        testRunResults.results((testRun) => [
                            testRun.status((status) => [status.name]),
                            testRun.test((test) => [test.jira({ fields: ["key"] })]),
                            testRun.evidence((evidence) => [evidence.filename]),
                            testRun.iterations({ limit: 100 }, (testRunIterationResults) => [
                                testRunIterationResults.results((testRunIteration) => [
                                    testRunIteration.status((status) => [status.name]),
                                ]),
                            ]),
                        ]),
                    ]
                );

                assert.partialDeepStrictEqual(testResultsRetriedScreenshot.results, [
                    {
                        status: { name: "FAILED" },
                        test: { jira: { key: testCase.linkedTests[1] } },
                        evidence: [
                            { filename: "CXP-18 my other screenshot (attempt 3).png" },
                            {
                                filename:
                                    "template spec -- CXP-18 manual screenshot (failed) (attempt 3).png",
                            },
                        ],
                        iterations: { results: [] },
                    },
                ]);
            });
        }
    }

    if (shouldRunIntegrationTests("server")) {
        for (const testCase of [
            {
                linkedTests: ["CYPLUG-1692", "CYPLUG-1694"],
                projectDirectory: join(import.meta.dirname, "server"),
                projectKey: "CYPLUG",
                title: "only last attempts are uploaded (server)",
            },
        ] as const) {
            void it(testCase.title, async (context) => {
                const output = runCypress(testCase.projectDirectory, {
                    expectedStatusCode: 1,
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
                    [testExecutionIssueKey, testCase.linkedTests[0]],
                    { logger: context.diagnostic.bind(context) }
                );
                const testRunRetried = await XRAY_CLIENT_SERVER.testRun.getTestRun({
                    testExecIssueKey: testExecutionIssueKey,
                    testIssueKey: testCase.linkedTests[0],
                });
                assert.partialDeepStrictEqual(testRunRetried, {
                    evidences: [{ fileName: "CYPLUG-1692 my screenshot (attempt 6).png" }],
                });
                const testResultsRetriedScreenshot = await XRAY_CLIENT_SERVER.testRun.getTestRun({
                    testExecIssueKey: testExecutionIssueKey,
                    testIssueKey: testCase.linkedTests[1],
                });
                assert.partialDeepStrictEqual(testResultsRetriedScreenshot, {
                    evidences: [
                        {
                            fileName: "CYPLUG-1694 my other screenshot (attempt 3).png",
                        },
                        {
                            fileName:
                                "template spec -- CYPLUG-1694 manual screenshot (failed) (attempt 3).png",
                        },
                    ],
                });
            });
        }
    }
});
