import type {
    HasAddAttachmentEndpoint,
    HasEditIssueEndpoint,
    HasGetFieldsEndpoint,
    HasSearchEndpoint,
    HasTransitionIssueEndpoint,
} from "../client/jira/jira-client";
import type {
    HasImportExecutionCucumberMultipartEndpoint,
    HasImportExecutionMultipartEndpoint,
    HasImportFeatureEndpoint,
} from "../client/xray/xray-client";
import type {
    HasAddEvidenceToTestRunEndpoint,
    HasGetTestRunResultsEndpoint,
} from "../client/xray/xray-client-cloud";
import type {
    HasAddEvidenceEndpoint,
    HasGetTestRunEndpoint,
} from "../client/xray/xray-client-server";
import type { PluginEventEmitter } from "../context";
import type {
    CypressFailedRunResult,
    CypressRunResult,
    CypressVersion,
    PluginConfigOptions,
    RunResult,
    ScreenshotDetails,
} from "../types/cypress";
import type {
    InternalCucumberOptions,
    InternalJiraOptions,
    InternalPluginOptions,
    InternalXrayOptions,
    PluginIssueUpdate,
} from "../types/plugin";
import type { XrayEvidenceItem } from "../types/xray/import-test-execution-results";
import { dedent } from "../util/dedent";
import { errorMessage } from "../util/errors";
import type { Logger } from "../util/logging";
import pluginPhases from "./plugin-phases";
import multipartInfoConversion from "./results-conversion/multipart-info-conversion";
import uploadValidation from "./results-upload/upload-validation";
import videoUpload from "./results-upload/video-upload";

export async function cypressXrayPlugin(parameters: RuntimeParameters) {
    // First, we upload all feature files to make sure the steps are up to date.
    const testExecutionIssueSummary = await pluginPhases.runFeatureFileUpload(parameters);
    // Now we can upload the results.
    if (!parameters.options.xray.uploadResults) {
        parameters.logger.message(
            "info",
            "Skipping results upload: Plugin is configured to not upload test results."
        );
        return;
    }
    const inspectionResult = inspectResults({
        cypress: { results: parameters.cypress.results },
        options: {
            cucumber: { featureFileExtension: parameters.options.cucumber?.featureFileExtension },
        },
    });
    if (inspectionResult.hasCypressFailed) {
        parameters.logger.message(
            "error",
            dedent(`
                Skipping results upload: Failed to run ${inspectionResult.results.failures.toString()} tests.

                  ${inspectionResult.results.message}
            `)
        );
        return;
    }
    const { containsCucumberTests, containsCypressTests, results } = inspectionResult;
    if (!containsCypressTests && !containsCucumberTests) {
        parameters.logger.message(
            "warning",
            "No test execution results to upload, skipping results upload preparations."
        );
        return;
    }
    const multipartInfoData = await convertMultipartInfo({
        ...parameters,
        cypress: { results: results },
        options: {
            jira: {
                ...parameters.options.jira,
                testExecutionIssue: {
                    ...parameters.options.jira.testExecutionIssue,
                    fields: {
                        ...parameters.options.jira.testExecutionIssue?.fields,
                        summary:
                            testExecutionIssueSummary ??
                            `Execution Results [${results.startedTestsAt}]`,
                    },
                },
            },
        },
    });
    for (const message of multipartInfoData.errorMessages) {
        parameters.logger.message("warning", message);
    }
    let cypressExecutionIssueKey: string | undefined = undefined;
    let cucumberExecutionIssueKey: string | undefined = undefined;
    if (containsCypressTests) {
        try {
            cypressExecutionIssueKey = await pluginPhases.runCypressUpload({
                ...parameters,
                cypress: { results: results },
                multipartInfo: multipartInfoData.multipartInfo,
            });
        } catch (error: unknown) {
            parameters.logger.message("error", errorMessage(error));
        }
    }
    if (containsCucumberTests) {
        try {
            cucumberExecutionIssueKey = await pluginPhases.runCucumberUpload({
                ...parameters,
                multipartInfo: multipartInfoData.multipartInfo,
            });
        } catch (error: unknown) {
            parameters.logger.message("error", errorMessage(error));
        }
    }
    const finalTestExecutionIssueKey = uploadValidation.validateUploads({
        cucumberExecutionIssueKey: cucumberExecutionIssueKey,
        cypressExecutionIssueKey: cypressExecutionIssueKey,
        logger: parameters.logger,
        url: parameters.options.jira.url,
    });
    if (finalTestExecutionIssueKey && parameters.options.jira.attachVideos) {
        await videoUpload.uploadVideos({
            client: parameters.clients.jira,
            cypress: {
                results: {
                    videos: results.runs.map((run) => run.video).filter((value) => value !== null),
                },
            },
            logger: parameters.logger,
            options: {
                jira: { testExecutionIssueKey: finalTestExecutionIssueKey },
            },
        });
    }
    // Workaround for: https://jira.atlassian.com/browse/JRASERVER-66881.
    if (
        finalTestExecutionIssueKey &&
        parameters.options.jira.testExecutionIssue?.transition &&
        !parameters.options.jira.testExecutionIssue.key &&
        !parameters.isCloudEnvironment
    ) {
        await parameters.clients.jira.transitionIssue(finalTestExecutionIssueKey, {
            transition: parameters.options.jira.testExecutionIssue.transition,
        });
    }
}

function inspectResults(parameters: {
    cypress: { results: CypressFailedRunResult | MinimalCypressRunResult };
    options: { cucumber: { featureFileExtension?: string } };
}):
    | {
          containsCucumberTests: boolean;
          containsCypressTests: boolean;
          hasCypressFailed: false;
          results: MinimalCypressRunResult;
      }
    | { hasCypressFailed: true; results: CypressFailedRunResult } {
    if ("status" in parameters.cypress.results && parameters.cypress.results.status === "failed") {
        return { hasCypressFailed: true, results: parameters.cypress.results };
    }
    return {
        containsCucumberTests: parameters.cypress.results.runs.some((run) => {
            return (
                parameters.options.cucumber.featureFileExtension &&
                run.spec.absolute.endsWith(parameters.options.cucumber.featureFileExtension)
            );
        }),
        containsCypressTests: parameters.cypress.results.runs.some((run) => {
            return (
                !parameters.options.cucumber.featureFileExtension ||
                !run.spec.absolute.endsWith(parameters.options.cucumber.featureFileExtension)
            );
        }),
        hasCypressFailed: false,
        results: parameters.cypress.results,
    };
}

async function convertMultipartInfo(parameters: {
    clients: {
        jira: HasGetFieldsEndpoint;
    };
    cypress: {
        results: MinimalCypressRunResult;
    };
    isCloudEnvironment: boolean;
    options: {
        jira: Pick<InternalJiraOptions, "attachVideos" | "projectKey" | "url"> & {
            fields: Pick<InternalJiraOptions["fields"], "testEnvironments" | "testPlan">;
            testExecutionIssue?: PluginIssueUpdate & {
                testEnvironments?: [string, ...string[]];
                testPlan?: string;
            };
        };
    };
}) {
    if (parameters.isCloudEnvironment) {
        return multipartInfoConversion.convertMultipartInfoCloud({
            cypress: {
                config: {
                    browserName: parameters.cypress.results.browserName,
                    browserVersion: parameters.cypress.results.browserVersion,
                    cypressVersion: parameters.cypress.results.cypressVersion,
                },
            },
            options: {
                jira: {
                    projectKey: parameters.options.jira.projectKey,
                    testExecutionIssue: parameters.options.jira.testExecutionIssue,
                },
            },
        });
    }
    return await multipartInfoConversion.convertMultipartInfoServer({
        client: parameters.clients.jira,
        cypress: {
            config: {
                browserName: parameters.cypress.results.browserName,
                browserVersion: parameters.cypress.results.browserVersion,
                cypressVersion: parameters.cypress.results.cypressVersion,
            },
        },
        options: {
            jira: {
                fields: {
                    testEnvironments: parameters.options.jira.fields.testEnvironments,
                    testPlan: parameters.options.jira.fields.testPlan,
                },
                projectKey: parameters.options.jira.projectKey,
                testExecutionIssue: parameters.options.jira.testExecutionIssue,
            },
        },
    });
}

type MinimalRunResult<T extends CypressVersion = CypressVersion> = {
    ["<13"]: Pick<RunResult<"<13">, "video"> & {
        spec: Pick<RunResult<"<13">["spec"], "absolute" | "relative">;
        tests: {
            attempts: {
                duration: RunResult<"<13">["tests"][number]["attempts"][number]["duration"];
                screenshots: Pick<
                    RunResult<"<13">["tests"][number]["attempts"][number]["screenshots"][number],
                    "path"
                >[];
                startedAt: RunResult<"<13">["tests"][number]["attempts"][number]["startedAt"];
                state: RunResult<"<13">["tests"][number]["attempts"][number]["state"];
            }[];
            title: RunResult<"<13">["tests"][number]["title"];
        }[];
    };
    [">=14"]: Pick<RunResult<">=14">, "video"> & {
        spec: Pick<RunResult<">=14">["spec"], "absolute" | "relative">;
        stats: Pick<RunResult<">=14">["stats"], "startedAt">;
        tests: {
            attempts: Pick<RunResult<">=14">["tests"][number]["attempts"][number], "state">[];
            duration: RunResult<">=14">["tests"][number]["duration"];
            state: RunResult<">=14">["tests"][number]["state"];
            title: RunResult<">=14">["tests"][number]["title"];
        }[];
    };
    ["13"]: Pick<RunResult<"13">, "video"> & {
        spec: Pick<RunResult<"13">["spec"], "absolute" | "relative">;
        stats: Pick<RunResult<"13">["stats"], "startedAt">;
        tests: {
            attempts: Pick<RunResult<"13">["tests"][number]["attempts"][number], "state">[];
            duration: RunResult<"13">["tests"][number]["duration"];
            state: RunResult<"13">["tests"][number]["state"];
            title: RunResult<"13">["tests"][number]["title"];
        }[];
    };
}[T];

export type MinimalCypressRunResult<T extends CypressVersion = CypressVersion> = {
    ["<13"]: Pick<
        CypressRunResult<"<13">,
        "browserName" | "browserVersion" | "cypressVersion" | "startedTestsAt" | "status"
    > & { runs: MinimalRunResult<"<13">[] };
    [">=14"]: Pick<
        CypressRunResult<">=14">,
        "browserName" | "browserVersion" | "cypressVersion" | "startedTestsAt"
    > & { runs: MinimalRunResult<">=14">[] };
    ["13"]: Pick<
        CypressRunResult<"13">,
        "browserName" | "browserVersion" | "cypressVersion" | "startedTestsAt"
    > & { runs: MinimalRunResult<"13">[] };
}[T];

export interface RuntimeParameters {
    clients: {
        jira: HasAddAttachmentEndpoint &
            HasSearchEndpoint &
            HasEditIssueEndpoint &
            HasGetFieldsEndpoint &
            HasTransitionIssueEndpoint;
        xray: HasImportFeatureEndpoint &
            HasImportExecutionMultipartEndpoint &
            HasImportExecutionCucumberMultipartEndpoint &
            (
                | (HasGetTestRunEndpoint & HasAddEvidenceEndpoint)
                | (HasGetTestRunResultsEndpoint & HasAddEvidenceToTestRunEndpoint)
            );
    };
    context: {
        emitter: Pick<PluginEventEmitter, "emit">;
        featureFilePaths: Iterable<string>;
        getEvidence: (issueKey: string) => XrayEvidenceItem[];
        getIterationParameters: (issueKey: string, testId: string) => Record<string, string>;
        screenshots: ScreenshotDetails[];
    };
    cypress: {
        config: Pick<PluginConfigOptions, "projectRoot">;
        results: CypressFailedRunResult | MinimalCypressRunResult;
    };
    isCloudEnvironment: boolean;
    logger: Pick<Logger, "message">;
    options: {
        cucumber?: Pick<
            InternalCucumberOptions,
            "featureFileExtension" | "prefixes" | "preprocessor"
        >;
        jira: Pick<InternalJiraOptions, "attachVideos" | "projectKey" | "url"> & {
            fields: Pick<InternalJiraOptions["fields"], "testEnvironments" | "testPlan">;
            testExecutionIssue?: PluginIssueUpdate & {
                testEnvironments?: [string, ...string[]];
                testPlan?: string;
            };
        };
        plugin: Pick<
            InternalPluginOptions,
            "normalizeScreenshotNames" | "splitUpload" | "uploadLastAttempt"
        >;
        xray: Pick<InternalXrayOptions, "status" | "uploadResults" | "uploadScreenshots">;
    };
}
