import assert from "node:assert";
import { join, relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import { runCypress } from "../../sh.mjs";
import { getIntegrationClient } from "../clients.mjs";
import {
    getCreatedTestExecutionIssueKey,
    searchIssues,
    shouldRunIntegrationTests,
} from "../util.mjs";

// ============================================================================================== //
// https://github.com/Qytera-Gmbh/cypress-xray-plugin/issues/421
// ============================================================================================== //

void describe(relative(cwd(), import.meta.filename), { timeout: 180000 }, () => {
    if (shouldRunIntegrationTests("cloud")) {
        for (const testCase of [
            {
                linkedTest: "CXP-1",
                projectDirectory: join(import.meta.dirname, "cloud"),
                projectKey: "CXP",
                title: "issue keys defined in describe titles (cloud)",
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
                const [testExecutionIssue, testIssue] = await searchIssues(
                    getIntegrationClient("jira", "cloud"),
                    [testExecutionIssueKey, testCase.linkedTest],
                    { logger: context.diagnostic.bind(context), fields: ["id"] }
                );

                const testResults = await getIntegrationClient("xray", "cloud").graphql.getTestRuns(
                    {
                        limit: 1,
                        testExecIssueIds: [testExecutionIssue.id],
                        testIssueIds: [testIssue.id],
                    },
                    (testRunResults) => [
                        testRunResults.results((testRun) => [
                            testRun.status((status) => [status.name]),
                            testRun.test((test) => [test.jira({ fields: ["key"] })]),
                            testRun.evidence((evidence) => [evidence.filename]),
                            testRun.iterations({ limit: 100 }, (testRunIterationResults) => [
                                testRunIterationResults.results((testRunIteration) => [
                                    testRunIteration.status((stepStatus) => [stepStatus.name]),
                                    testRunIteration.parameters((testRunParameter) => [
                                        testRunParameter.name,
                                        testRunParameter.value,
                                    ]),
                                ]),
                            ]),
                        ]),
                    ]
                );
                assert.partialDeepStrictEqual(testResults, {
                    results: [
                        {
                            status: { name: "FAILED" },
                            test: { jira: { key: testCase.linkedTest } },
                            evidence: [
                                {
                                    filename: `${testCase.linkedTest} Test Suite Name -- Test Method Name 1 (failed).png`,
                                },
                                { filename: `${testCase.linkedTest}-test-evidence-2.png` },
                            ],
                            iterations: {
                                results: [
                                    {
                                        parameters: [{ name: "iteration", value: "1" }],
                                        status: { name: "FAILED" },
                                    },
                                    {
                                        parameters: [{ name: "iteration", value: "2" }],
                                        status: { name: "PASSED" },
                                    },
                                ],
                            },
                        },
                    ],
                });
            });
        }
    }

    if (shouldRunIntegrationTests("server")) {
        for (const testCase of [
            {
                linkedTest: "CYPLUG-1082",
                projectDirectory: join(import.meta.dirname, "server"),
                projectKey: "CYPLUG",
                title: "issue keys defined in describe titles (server)",
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
                    getIntegrationClient("jira", "server"),
                    [testExecutionIssueKey, testCase.linkedTest],
                    { logger: context.diagnostic.bind(context) }
                );
                const testRun = await getIntegrationClient("xray", "server").testRun.getTestRun({
                    testExecIssueKey: testExecutionIssueKey,
                    testIssueKey: testCase.linkedTest,
                });
                assert.partialDeepStrictEqual(testRun, {
                    status: "FAIL",
                    testKey: testCase.linkedTest,
                    evidences: [
                        {
                            fileName: `${testCase.linkedTest} Test Suite Name -- Test Method Name 1 (failed).png`,
                        },
                        {
                            fileName: `${testCase.linkedTest}-test-evidence-2.png`,
                        },
                    ],
                    iterations: [
                        // Workaround because of configured status automations for which I don't have permission.
                        // Would be "FAIL" normally.
                        { status: "TODO", parameters: [{ name: "iteration", value: "1" }] },
                        { status: "TODO", parameters: [{ name: "iteration", value: "2" }] },
                    ],
                });
            });
        }
    }
});
