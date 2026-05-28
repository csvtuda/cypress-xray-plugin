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
// https://github.com/Qytera-Gmbh/cypress-xray-plugin/issues/328
// ============================================================================================== //

void describe(relative(cwd(), import.meta.filename), { timeout: 180000 }, () => {
    if (shouldRunIntegrationTests("cloud")) {
        for (const testCase of [
            {
                cucumberTests: ["CXP-5", "CXP-6"],
                manualTests: ["CXP-7", "CXP-8"],
                projectDirectory: join(import.meta.dirname, "cloud"),
                projectKey: "CXP",
                title: "results upload works for tests with multiple issue keys (cloud)",
            },
        ] as const) {
            void it(testCase.title, async (context) => {
                const output = runCypress(testCase.projectDirectory, {
                    includeDefaultEnv: "cloud",
                });

                const testExecutionIssueKey = getCreatedTestExecutionIssueKey(
                    testCase.projectKey,
                    output,
                    "both"
                );

                const [execution] = await searchIssues(
                    getIntegrationClient("jira", "cloud"),
                    [testExecutionIssueKey],
                    { logger: context.diagnostic.bind(context), fields: ["id"] }
                );
                const query = await getIntegrationClient("xray", "cloud").graphql.getTestExecution(
                    { issueId: execution.id },
                    (testExecution) => [
                        testExecution.tests({ limit: 100 }, (testResults) => [
                            testResults.results((test) => [test.jira({ fields: ["key"] })]),
                        ]),
                    ]
                );
                assert.partialDeepStrictEqual(query, {
                    tests: {
                        results: [
                            { jira: { key: testCase.manualTests[0] } },
                            { jira: { key: testCase.manualTests[1] } },
                            { jira: { key: testCase.cucumberTests[0] } },
                            { jira: { key: testCase.cucumberTests[1] } },
                        ],
                    },
                });
            });
        }
    }

    if (shouldRunIntegrationTests("server")) {
        for (const testCase of [
            {
                cucumberTests: ["CYPLUG-342", "CYPLUG-343"],
                manualTests: ["CYPLUG-340", "CYPLUG-341"],
                projectDirectory: join(import.meta.dirname, "server"),
                projectKey: "CYPLUG",
                title: "results upload works for tests with multiple issue keys (server)",
            },
        ] as const) {
            void it(testCase.title, async () => {
                const output = runCypress(testCase.projectDirectory, {
                    includeDefaultEnv: "server",
                });

                const testExecutionIssueKey = getCreatedTestExecutionIssueKey(
                    testCase.projectKey,
                    output,
                    "both"
                );

                const testResults = await getIntegrationClient(
                    "xray",
                    "server"
                ).testExecution.getTests(testExecutionIssueKey);
                assert.partialDeepStrictEqual(testResults, [
                    { key: testCase.manualTests[0] },
                    { key: testCase.manualTests[1] },
                    { key: testCase.cucumberTests[0] },
                    { key: testCase.cucumberTests[1] },
                ]);
            });
        }
    }
});
