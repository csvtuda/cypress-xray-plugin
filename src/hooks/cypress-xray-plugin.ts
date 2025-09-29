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
import type {
    EvidenceCollection,
    IterationParameterCollection,
    PluginEventEmitter,
    ScreenshotCollection,
} from "../context";
import type {
    CypressFailedRunResult,
    CypressRunResult,
    PluginConfigOptions,
} from "../types/cypress";
import type {
    InternalCucumberOptions,
    InternalJiraOptions,
    InternalPluginOptions,
    InternalXrayOptions,
    PluginIssueUpdate,
} from "../types/plugin";
import { dedent } from "../util/dedent";
import { errorMessage } from "../util/errors";
import type { Logger } from "../util/logging";
import { uploadCucumberResults } from "./cucumber-result-upload";
import { uploadCypressResults } from "./cypress-result-upload";
import { processFeatureFiles } from "./feature-file-processing";
import { uploadFeatureFiles } from "./feature-file-upload";
import { getIssueSnapshots, restoreIssueSnapshots } from "./jira-issue-snapshots";
import { convertMultipartInfoCloud, convertMultipartInfoServer } from "./multipart-info-conversion";
import { validateUploads } from "./upload-validation";
import { uploadVideos } from "./video-upload";

export async function cypressXrayPlugin(parameters: RuntimeParameters) {
    // First, we upload all feature files to make sure the steps are up to date.
    const processedFeatureFiles = processFeatureFiles({
        displayCloudHelp: parameters.isCloudEnvironment,
        featureFilePaths: parameters.context.featureFilePaths,
        logger: parameters.logger,
        prefixes: parameters.options.cucumber?.prefixes,
        projectKey: parameters.options.jira.projectKey,
    });
    // Xray currently (almost) always overwrites issue data when importing feature files to
    // existing issues. Therefore, we manually need to backup and reset the data once the
    // import is done.
    // See: https://docs.getxray.app/display/XRAY/Importing+Cucumber+Tests+-+REST
    // See: https://docs.getxray.app/display/XRAYCLOUD/Importing+Cucumber+Tests+-+REST+v2
    const issuesToSnapshot = new Set(
        processedFeatureFiles.flatMap((featureFile) => featureFile.allIssueKeys)
    );
    // If we have a test execution issue key defined and no summary, we need to fetch the existing
    // test execution issue summary so that we can later on restore it as well.
    if (parameters.options.xray.uploadResults && parameters.options.jira.testExecutionIssue?.key) {
        if (!parameters.options.jira.testExecutionIssue.fields?.summary) {
            issuesToSnapshot.add(parameters.options.jira.testExecutionIssue.key);
        }
    }
    const issueSnapshot = await getIssueSnapshots({
        client: parameters.clients.jira,
        issues: [...issuesToSnapshot].map((key) => {
            return { key };
        }),
    });
    if (issueSnapshot.errorMessages.length > 0) {
        parameters.logger.message(
            "warning",
            dedent(`
                Backing up Jira issue data failed for some issues, which may result in undesired data being displayed after the plugin has run:

                  ${issueSnapshot.errorMessages.join("\n")}
            `)
        );
    }
    const successfulFeatureFileUploads = await uploadFeatureFiles({
        clients: {
            jira: parameters.clients.jira,
            xray: parameters.clients.xray,
        },
        logger: parameters.logger,
        options: {
            jira: {
                projectKey: parameters.options.jira.projectKey,
            },
        },
        processedFeatureFiles: processedFeatureFiles,
    });
    const newIssueSnapshot = await getIssueSnapshots({
        client: parameters.clients.jira,
        issues: successfulFeatureFileUploads
            .flatMap((issues) => issues.affectedIssues)
            .map((key) => {
                return { key };
            }),
    });
    if (newIssueSnapshot.errorMessages.length > 0) {
        parameters.logger.message(
            "warning",
            dedent(`
                Comparison of updated Jira issue data to backed up data failed for some issues, which may result in undesired data being displayed after the plugin has run:

                  ${newIssueSnapshot.errorMessages.join("\n")}
            `)
        );
    }
    await restoreIssueSnapshots({
        client: parameters.clients.jira,
        logger: parameters.logger,
        newData: newIssueSnapshot.issues,
        previousData: issueSnapshot.issues,
    });
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
    const multipartInfoData = parameters.isCloudEnvironment
        ? convertMultipartInfoCloud({
              cypress: {
                  config: {
                      browserName: results.browserName,
                      browserVersion: results.browserVersion,
                      cypressVersion: results.cypressVersion,
                  },
              },
              options: {
                  jira: {
                      projectKey: parameters.options.jira.projectKey,
                      testExecutionIssue: {
                          ...parameters.options.jira.testExecutionIssue,
                          fields: {
                              ...parameters.options.jira.testExecutionIssue?.fields,
                              summary:
                                  parameters.options.jira.testExecutionIssue?.fields?.summary ??
                                  issueSnapshot.issues.find(
                                      (data) =>
                                          data.key ===
                                          parameters.options.jira.testExecutionIssue?.key
                                  )?.summary ??
                                  `Execution Results [${results.startedTestsAt}]`,
                          },
                      },
                  },
              },
          })
        : await convertMultipartInfoServer({
              client: parameters.clients.jira,
              cypress: {
                  config: {
                      browserName: results.browserName,
                      browserVersion: results.browserVersion,
                      cypressVersion: results.cypressVersion,
                  },
              },
              options: {
                  jira: {
                      fields: {
                          testEnvironments: parameters.options.jira.fields.testEnvironments,
                          testPlan: parameters.options.jira.fields.testPlan,
                      },
                      projectKey: parameters.options.jira.projectKey,
                      testExecutionIssue: {
                          ...parameters.options.jira.testExecutionIssue,
                          fields: {
                              ...parameters.options.jira.testExecutionIssue?.fields,
                              summary:
                                  parameters.options.jira.testExecutionIssue?.fields?.summary ??
                                  issueSnapshot.issues.find(
                                      (data) =>
                                          data.key ===
                                          parameters.options.jira.testExecutionIssue?.key
                                  )?.summary ??
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
            const uploadAttempt = await uploadCypressResults({
                client: parameters.clients.xray,
                context: {
                    evidenceCollection: parameters.context.evidenceCollection,
                    iterationParameterCollection: parameters.context.iterationParameterCollection,
                    screenshotCollection: parameters.context.screenshotCollection,
                },
                cypress: {
                    results: results,
                },
                isCloudEnvironment: parameters.isCloudEnvironment,
                logger: parameters.logger,
                multipartInfo: multipartInfoData.multipartInfo,
                options: {
                    cucumber: {
                        featureFileExtension: parameters.options.cucumber?.featureFileExtension,
                    },
                    jira: {
                        projectKey: parameters.options.jira.projectKey,
                    },
                    plugin: {
                        normalizeScreenshotNames:
                            parameters.options.plugin.normalizeScreenshotNames,
                        splitUpload: parameters.options.plugin.splitUpload,
                        uploadLastAttempt: parameters.options.plugin.uploadLastAttempt,
                    },
                    xray: {
                        uploadScreenshots: parameters.options.xray.uploadScreenshots,
                        xrayStatus: parameters.options.xray.status,
                    },
                },
            });
            cypressExecutionIssueKey = uploadAttempt.testExecutionIssueKey;
            await parameters.context.emitter.emit("upload:cypress", {
                info: multipartInfoData.multipartInfo,
                results: uploadAttempt.xrayJson,
                testExecutionIssueKey: cypressExecutionIssueKey,
            });
        } catch (error: unknown) {
            parameters.logger.message("error", errorMessage(error));
        }
    }
    if (containsCucumberTests) {
        try {
            const uploadResult = await uploadCucumberResults({
                client: parameters.clients.xray,
                cypress: {
                    config: parameters.cypress.config,
                },
                cypressExecutionIssueKey: cypressExecutionIssueKey,
                isCloudEnvironment: parameters.isCloudEnvironment,
                logger: parameters.logger,
                multipartInfo: multipartInfoData.multipartInfo,
                options: {
                    cucumber: {
                        prefixes: {
                            test: parameters.options.cucumber?.prefixes.test,
                        },
                        reportPath: parameters.options.cucumber?.preprocessor?.json.output,
                    },
                    jira: {
                        projectKey: parameters.options.jira.projectKey,
                        testExecutionIssue: {
                            key: parameters.options.jira.testExecutionIssue?.key,
                        },
                    },
                    xray: {
                        status: {
                            failed: parameters.options.xray.status.failed,
                            passed: parameters.options.xray.status.passed,
                            pending: parameters.options.xray.status.pending,
                            skipped: parameters.options.xray.status.skipped,
                        },
                        uploadScreenshots: parameters.options.xray.uploadScreenshots,
                    },
                },
            });
            cucumberExecutionIssueKey = uploadResult.testExecutionIssueKey;
            await parameters.context.emitter.emit("upload:cucumber", {
                results: {
                    features: uploadResult.features,
                    info: multipartInfoData.multipartInfo,
                },
                testExecutionIssueKey: cucumberExecutionIssueKey,
            });
        } catch (error: unknown) {
            parameters.logger.message("error", errorMessage(error));
        }
        const finalTestExecutionIssueKey = validateUploads({
            cucumberExecutionIssueKey: cucumberExecutionIssueKey,
            cypressExecutionIssueKey: cypressExecutionIssueKey,
            logger: parameters.logger,
            url: parameters.options.jira.url,
        });
        if (finalTestExecutionIssueKey && parameters.options.jira.attachVideos) {
            await uploadVideos({
                client: parameters.clients.jira,
                cypress: {
                    results: {
                        videos: results.runs
                            .map((run) => run.video)
                            .filter((value) => value !== null),
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
}

function inspectResults(parameters: {
    cypress: { results: CypressFailedRunResult | CypressRunResult };
    options: { cucumber: { featureFileExtension?: string } };
}):
    | {
          containsCucumberTests: boolean;
          containsCypressTests: boolean;
          hasCypressFailed: false;
          results: CypressRunResult;
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

interface RuntimeParameters {
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
        emitter: PluginEventEmitter;
        evidenceCollection: EvidenceCollection;
        featureFilePaths: Iterable<string>;
        iterationParameterCollection: IterationParameterCollection;
        screenshotCollection: ScreenshotCollection;
    };
    cypress: {
        config: Pick<PluginConfigOptions, "projectRoot">;
        results: CypressFailedRunResult | CypressRunResult;
    };
    isCloudEnvironment: boolean;
    logger: Logger;
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
