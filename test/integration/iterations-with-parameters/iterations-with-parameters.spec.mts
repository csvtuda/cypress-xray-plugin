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
// https://github.com/Qytera-Gmbh/cypress-xray-plugin/issues/452
// ============================================================================================== //

void describe(relative(cwd(), import.meta.filename), { timeout: 180000 }, () => {
    if (shouldRunIntegrationTests("cloud")) {
        for (const testCase of [
            {
                linkedTest: "CXP-2",
                projectDirectory: join(import.meta.dirname, "cloud"),
                projectKey: "CXP",
                title: "iteration parameters can be provided (cloud)",
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
                            testRun.iterations({ limit: 100 }, (testRunIterationResults) => [
                                testRunIterationResults.results((testRunIteration) => [
                                    testRunIteration.parameters((testRunParameter) => [
                                        testRunParameter.name,
                                        testRunParameter.value,
                                    ]),
                                    testRunIteration.status((status) => [status.name]),
                                ]),
                            ]),
                        ]),
                    ]
                );
                assert.partialDeepStrictEqual(testResults, {
                    results: [
                        {
                            status: { name: "PASSED" },
                            test: { jira: { key: testCase.linkedTest } },
                            iterations: {
                                results: [
                                    {
                                        parameters: [
                                            { name: "iteration", value: "1" },
                                            { name: "hello", value: "there" },
                                            { name: "good", value: "morning" },
                                            { name: "using", value: "cy.task" },
                                            { name: "id", value: "#1" },
                                        ],
                                        status: { name: "PASSED" },
                                    },
                                    {
                                        parameters: [
                                            { name: "iteration", value: "2" },
                                            { name: "hello", value: "there" },
                                            { name: "good", value: "morning" },
                                            { name: "using", value: "cy.task" },
                                            { name: "id", value: "#2" },
                                        ],
                                        status: { name: "PASSED" },
                                    },
                                    {
                                        parameters: [
                                            { name: "iteration", value: "3" },
                                            { name: "hello", value: "there" },
                                            { name: "good", value: "morning" },
                                            { name: "using", value: "cy.task" },
                                            { name: "id", value: "#3" },
                                        ],
                                        status: { name: "PASSED" },
                                    },
                                    {
                                        parameters: [
                                            { name: "iteration", value: "4" },
                                            { name: "hello", value: "there" },
                                            { name: "good", value: "morning" },
                                            { name: "using", value: "enqueueTask" },
                                            { name: "id", value: "" },
                                        ],
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
                linkedTest: "CYPLUG-1411",
                projectDirectory: join(import.meta.dirname, "server"),
                projectKey: "CYPLUG",
                title: "iteration parameters can be provided (server)",
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
                assert.partialDeepStrictEqual(testRun, {
                    status: "PASS",
                    testKey: testCase.linkedTest,
                    iterations: [
                        {
                            // Workarounds because of configured status automations for which I don't have permission.
                            // "TODO" Would be "PASS" normally.
                            status: "TODO",
                            parameters: [
                                { name: "iteration", value: "1" },
                                { name: "hello", value: "there" },
                                { name: "good", value: "morning" },
                                { name: "using", value: "cy.task" },
                                { name: "id", value: "#1" },
                            ],
                        },
                        {
                            status: "TODO",
                            parameters: [
                                { name: "iteration", value: "2" },
                                { name: "hello", value: "there" },
                                { name: "good", value: "morning" },
                                { name: "using", value: "cy.task" },
                                { name: "id", value: "#2" },
                            ],
                        },
                        {
                            status: "TODO",
                            parameters: [
                                { name: "iteration", value: "3" },
                                { name: "hello", value: "there" },
                                { name: "good", value: "morning" },
                                { name: "using", value: "cy.task" },
                                { name: "id", value: "#3" },
                            ],
                        },
                        {
                            status: "TODO",
                            parameters: [
                                { name: "iteration", value: "4" },
                                { name: "hello", value: "there" },
                                { name: "good", value: "morning" },
                                { name: "using", value: "enqueueTask" },
                                { name: "id", value: "" },
                            ],
                        },
                    ],
                });
            });
        }
    }
});
