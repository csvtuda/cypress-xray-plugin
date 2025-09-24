import assert from "node:assert";
import { relative } from "node:path";
import { cwd } from "node:process";
import { describe, it } from "node:test";
import { LOG } from "../../../../util/logging";
import { ConstantCommand } from "../../../util/commands/constant-command";
import { ConvertInfoCloudCommand, ConvertInfoServerCommand } from "./convert-info-command";

void describe(relative(cwd(), __filename), () => {
    void describe(ConvertInfoServerCommand.name, () => {
        void it("converts cucumber results into server cucumber info data", async (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const command = new ConvertInfoServerCommand(
                {
                    jira: {
                        projectKey: "CYP",
                    },
                    xray: { uploadScreenshots: false },
                },
                LOG,
                {
                    issuetype: new ConstantCommand(LOG, { id: "issue_1578" }),
                    results: new ConstantCommand(LOG, {
                        browserName: "Firefox",
                        browserVersion: "123.11.6",
                        cypressVersion: "42.4.9",
                        endedTestsAt: "2023-09-09T10:59:36.177Z",
                        startedTestsAt: "2023-09-09T10:59:28.829Z",
                    }),
                    summary: new ConstantCommand(LOG, "Execution Results [1694257168829]"),
                }
            );
            const info = await command.compute();
            assert.deepStrictEqual(info, {
                fields: {
                    description: "Cypress version: 42.4.9\nBrowser: Firefox (123.11.6)",
                    issuetype: { id: "issue_1578" },
                    project: {
                        key: "CYP",
                    },
                    summary: "Execution Results [1694257168829]",
                },
                historyMetadata: undefined,
                properties: undefined,
                transition: undefined,
                update: undefined,
            });
        });

        void it("includes configured test plan issue keys", async (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const command = new ConvertInfoServerCommand(
                {
                    jira: {
                        projectKey: "CYP",
                        testPlanIssueKey: "CYP-123",
                    },
                    xray: { uploadScreenshots: false },
                },
                LOG,
                {
                    fieldIds: {
                        testPlanId: new ConstantCommand(LOG, "customfield_12345"),
                    },
                    issuetype: new ConstantCommand(LOG, {}),
                    results: new ConstantCommand(LOG, {
                        browserName: "Firefox",
                        browserVersion: "123.11.6",
                        cypressVersion: "42.4.9",
                        endedTestsAt: "2023-09-09T10:59:31.416Z",
                        startedTestsAt: "2023-09-09T10:59:28.829Z",
                    }),
                    summary: new ConstantCommand(LOG, "my summary"),
                }
            );
            const info = await command.compute();
            assert.deepStrictEqual(info.fields.customfield_12345, ["CYP-123"]);
        });

        void it("includes configured test environments", async (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const command = new ConvertInfoServerCommand(
                {
                    jira: {
                        projectKey: "CYP",
                    },
                    xray: { testEnvironments: ["DEV", "PROD"], uploadScreenshots: false },
                },
                LOG,
                {
                    fieldIds: {
                        testEnvironmentsId: new ConstantCommand(LOG, "customfield_45678"),
                    },
                    issuetype: new ConstantCommand(LOG, {}),
                    results: new ConstantCommand(LOG, {
                        browserName: "Firefox",
                        browserVersion: "123.11.6",
                        cypressVersion: "42.4.9",
                        endedTestsAt: "2023-09-09T10:59:31.416Z",
                        startedTestsAt: "2023-09-09T10:59:28.829Z",
                    }),
                    summary: new ConstantCommand(LOG, "my summary"),
                }
            );
            const info = await command.compute();
            assert.deepStrictEqual(info.fields.customfield_45678, ["DEV", "PROD"]);
        });

        void it("throws if no test plan id is supplied", (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            assert.throws(
                () =>
                    new ConvertInfoServerCommand(
                        {
                            jira: {
                                projectKey: "CYP",
                                testPlanIssueKey: "CYP-123",
                            },
                            xray: { uploadScreenshots: false },
                        },
                        LOG,
                        {
                            issuetype: new ConstantCommand(LOG, {}),
                            results: new ConstantCommand(LOG, {
                                browserName: "Firefox",
                                browserVersion: "123.11.6",
                                cypressVersion: "42.4.9",
                                endedTestsAt: "2023-09-09T10:59:31.416Z",
                                startedTestsAt: "2023-09-09T10:59:28.829Z",
                            }),
                            summary: new ConstantCommand(LOG, "my summary"),
                        }
                    ),
                {
                    message:
                        "A test plan issue key was supplied without the test plan Jira field ID",
                }
            );
        });

        void it("throws if no test environments id is supplied", (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            assert.throws(
                () =>
                    new ConvertInfoServerCommand(
                        {
                            jira: {
                                projectKey: "CYP",
                            },
                            xray: { testEnvironments: ["DEV", "PROD"], uploadScreenshots: false },
                        },
                        LOG,
                        {
                            issuetype: new ConstantCommand(LOG, {}),
                            results: new ConstantCommand(LOG, {
                                browserName: "Firefox",
                                browserVersion: "123.11.6",
                                cypressVersion: "42.4.9",
                                endedTestsAt: "2023-09-09T10:59:31.416Z",
                                startedTestsAt: "2023-09-09T10:59:28.829Z",
                            }),
                            summary: new ConstantCommand(LOG, "my summary"),
                        }
                    ),
                {
                    message:
                        "Test environments were supplied without the test environments Jira field ID",
                }
            );
        });

        void it("returns parameters", (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const command = new ConvertInfoServerCommand(
                {
                    jira: {
                        projectKey: "CYP",
                    },
                    xray: { uploadScreenshots: false },
                },
                LOG,
                {
                    issuetype: new ConstantCommand(LOG, {}),
                    results: new ConstantCommand(LOG, {
                        browserName: "Firefox",
                        browserVersion: "123.11.6",
                        cypressVersion: "42.4.9",
                        endedTestsAt: "2023-09-09T10:59:31.416Z",
                        startedTestsAt: "2023-09-09T10:59:28.829Z",
                    }),
                    summary: new ConstantCommand(LOG, "my summary"),
                }
            );
            assert.deepStrictEqual(command.getParameters(), {
                jira: {
                    projectKey: "CYP",
                },
                xray: { uploadScreenshots: false },
            });
        });
    });

    void describe(ConvertInfoCloudCommand.name, () => {
        void it("converts cucumber results into cucumber info data", async (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const command = new ConvertInfoCloudCommand(
                {
                    jira: {
                        projectKey: "CYP",
                    },
                    xray: { uploadScreenshots: false },
                },
                LOG,
                {
                    issuetype: new ConstantCommand(LOG, { id: "issue_1578" }),
                    results: new ConstantCommand(LOG, {
                        browserName: "Firefox",
                        browserVersion: "123.11.6",
                        cypressVersion: "42.4.9",
                        endedTestsAt: "2023-09-09T10:59:31.416Z",
                        startedTestsAt: "2023-09-09T10:59:28.829Z",
                    }),
                    summary: new ConstantCommand(LOG, "Execution Results [1694257168829]"),
                }
            );
            const info = await command.compute();
            assert.deepStrictEqual(info, {
                fields: {
                    description: "Cypress version: 42.4.9\nBrowser: Firefox (123.11.6)",
                    issuetype: { id: "issue_1578" },
                    project: {
                        key: "CYP",
                    },
                    summary: "Execution Results [1694257168829]",
                },
                historyMetadata: undefined,
                properties: undefined,
                transition: undefined,
                update: undefined,
                xrayFields: {
                    environments: undefined,
                    testPlanKey: undefined,
                },
            });
        });

        void it("includes configured test plan issue keys", async (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const command = new ConvertInfoCloudCommand(
                {
                    jira: {
                        projectKey: "CYP",
                        testPlanIssueKey: "CYP-123",
                    },
                    xray: { uploadScreenshots: false },
                },
                LOG,
                {
                    issuetype: new ConstantCommand(LOG, {}),
                    results: new ConstantCommand(LOG, {
                        browserName: "Firefox",
                        browserVersion: "123.11.6",
                        cypressVersion: "42.4.9",
                        endedTestsAt: "2023-09-09T10:59:31.416Z",
                        startedTestsAt: "2023-09-09T10:59:28.829Z",
                    }),
                    summary: new ConstantCommand(LOG, "my summary"),
                }
            );
            const info = await command.compute();
            assert.deepStrictEqual(info.xrayFields, {
                environments: undefined,
                testPlanKey: "CYP-123",
            });
        });

        void it("includes configured test environments", async (context) => {
            context.mock.method(LOG, "message", context.mock.fn());
            const command = new ConvertInfoCloudCommand(
                {
                    jira: {
                        projectKey: "CYP",
                    },
                    xray: { testEnvironments: ["DEV", "PROD"], uploadScreenshots: false },
                },
                LOG,
                {
                    issuetype: new ConstantCommand(LOG, {}),
                    results: new ConstantCommand(LOG, {
                        browserName: "Firefox",
                        browserVersion: "123.11.6",
                        cypressVersion: "42.4.9",
                        endedTestsAt: "2023-09-09T10:59:31.416Z",
                        startedTestsAt: "2023-09-09T10:59:28.829Z",
                    }),
                    summary: new ConstantCommand(LOG, "my summary"),
                }
            );
            const info = await command.compute();
            assert.deepStrictEqual(info.xrayFields, {
                environments: ["DEV", "PROD"],
                testPlanKey: undefined,
            });
        });
    });
});
