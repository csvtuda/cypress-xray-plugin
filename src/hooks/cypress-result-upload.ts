import { basename, extname, parse } from "node:path";
import { lt } from "semver";
import type { HasImportExecutionMultipartEndpoint } from "../client/xray/xray-client";
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
    ScreenshotCollection,
} from "../context";
import type { CypressRunResult, RunResult } from "../types/cypress";
import { CypressStatus } from "../types/cypress/status";
import type { InternalXrayOptions } from "../types/plugin";
import type {
    XrayEvidenceItem,
    XrayIterationResult,
    XrayTest,
    XrayTestExecutionResults,
} from "../types/xray/import-test-execution-results";
import type { MultipartInfo } from "../types/xray/requests/import-execution-multipart-info";
import { encodeFile } from "../util/base64";
import { dedent } from "../util/dedent";
import { errorMessage } from "../util/errors";
import { normalizedFilename } from "../util/files";
import { HELP } from "../util/help";
import type { Logger } from "../util/logging";
import { LOG } from "../util/logging";
import { unknownToString } from "../util/string";
import { earliestDate, latestDate, truncateIsoTime } from "../util/time";
import type {
    FailedConversion,
    RunConverter,
    SuccessfulConversion,
} from "./results-conversion/cypress/util/converter";
import { RunConverterLatest, RunConverterV12 } from "./results-conversion/cypress/util/converter";
import { getXrayStatus as getXrayCypressStatus } from "./results-conversion/cypress/util/status-conversion";

export async function uploadCypressResults(parameters: {
    client: HasImportExecutionMultipartEndpoint &
        (
            | (HasGetTestRunEndpoint & HasAddEvidenceEndpoint)
            | (HasGetTestRunResultsEndpoint & HasAddEvidenceToTestRunEndpoint)
        );
    context: {
        evidenceCollection: EvidenceCollection;
        iterationParameterCollection: IterationParameterCollection;
        screenshotCollection: ScreenshotCollection;
    };
    cypress: {
        results: CypressRunResult;
    };
    isCloudEnvironment: boolean;
    logger: Logger;
    multipartInfo: MultipartInfo;
    options: {
        cucumber: {
            featureFileExtension?: string;
        };
        jira: {
            projectKey: string;
            testExecutionIssueKey?: string;
        };
        plugin: {
            normalizeScreenshotNames: boolean;
            splitUpload: "sequential" | boolean;
            uploadLastAttempt: boolean;
        };
        xray: {
            uploadScreenshots: boolean;
            xrayStatus: InternalXrayOptions["status"];
        };
    };
}) {
    const conversions = convertCypressTests({
        context: {
            evidenceCollection: parameters.context.evidenceCollection,
            iterationParameterCollection: parameters.context.iterationParameterCollection,
            screenshotCollection: parameters.context.screenshotCollection,
        },
        cypress: { results: parameters.cypress.results },
        isCloudEnvironment: parameters.isCloudEnvironment,
        options: {
            cucumber: {
                featureFileExtension: parameters.options.cucumber.featureFileExtension,
            },
            jira: {
                projectKey: parameters.options.jira.projectKey,
            },
            plugin: {
                normalizeScreenshotNames: parameters.options.plugin.normalizeScreenshotNames,
                uploadLastAttempt: parameters.options.plugin.uploadLastAttempt,
            },
            xray: {
                uploadScreenshots: parameters.options.xray.uploadScreenshots,
                xrayStatus: parameters.options.xray.xrayStatus,
            },
        },
    });
    for (const { error, filePath, testTitle } of conversions.failedConversions) {
        parameters.logger.message(
            "warning",
            dedent(`
                ${filePath}

                  Test: ${testTitle}

                    Skipping result upload.

                      Caused by: ${errorMessage(error)}
            `)
        );
    }
    for (const screenshotPath of conversions.nonAttributableScreenshots) {
        const screenshotName = parse(screenshotPath).name;
        parameters.logger.message(
            "warning",
            dedent(`
                ${screenshotPath}

                  Screenshot cannot be attributed to a test and will not be uploaded.

                  To upload screenshots, include test issue keys anywhere in their name:

                    cy.screenshot("${parameters.options.jira.projectKey}-123 ${screenshotName}")
            `)
        );
    }
    if (conversions.successfulConversions.length === 0) {
        throw new Error(
            "Failed to convert Cypress tests into Xray tests: No Cypress tests to upload"
        );
    }
    const xrayJson: XrayTestExecutionResults = {
        testExecutionKey: parameters.options.jira.testExecutionIssueKey,
        tests: [
            conversions.successfulConversions[0],
            ...conversions.successfulConversions.slice(1),
        ],
    };
    const uploadResult = await importExecutionCypress({
        client: parameters.client,
        results: xrayJson,
        resultsInfo: parameters.multipartInfo,
        splitUpload: parameters.options.plugin.splitUpload,
    });
    for (const message of uploadResult.evidenceUploadErrors) {
        parameters.logger.message("warning", message);
    }
    return { testExecutionIssueKey: uploadResult.testExecutionIssueKey, xrayJson: xrayJson };
}

async function importExecutionCypress(parameters: {
    client: HasImportExecutionMultipartEndpoint &
        (
            | (HasGetTestRunEndpoint & HasAddEvidenceEndpoint)
            | (HasGetTestRunResultsEndpoint & HasAddEvidenceToTestRunEndpoint)
        );
    results: XrayTestExecutionResults;
    resultsInfo: MultipartInfo;
    splitUpload: "sequential" | boolean;
}) {
    let testExecutionIssueKey: string;
    const evidenceUploadErrors: string[] = [];
    if (parameters.splitUpload) {
        const evidencyByTestIssue = new Map<string, XrayEvidenceItem[]>();
        if (parameters.results.tests) {
            for (const test of parameters.results.tests) {
                if (test.testKey && test.evidence) {
                    evidencyByTestIssue.set(test.testKey, test.evidence);
                    delete test.evidence;
                }
            }
        }
        testExecutionIssueKey = await parameters.client.importExecutionMultipart(
            parameters.results,
            parameters.resultsInfo
        );
        const entries = [...evidencyByTestIssue.entries()];
        const uploadCallbacks = entries.map(async ([issueKey, evidences]) => {
            try {
                await uploadTestEvidences({
                    client: parameters.client,
                    evidences: evidences,
                    issueKey: issueKey,
                    splitUpload: parameters.splitUpload,
                    testExecIssueKey: testExecutionIssueKey,
                });
            } catch (error: unknown) {
                evidenceUploadErrors.push(
                    dedent(`
                        Failed to attach evidences of test ${issueKey} to test execution ${testExecutionIssueKey}:

                          ${unknownToString(error)}
                    `)
                );
            }
        });
        await Promise.all(uploadCallbacks);
    } else {
        testExecutionIssueKey = await parameters.client.importExecutionMultipart(
            parameters.results,
            parameters.resultsInfo
        );
    }
    return { evidenceUploadErrors, testExecutionIssueKey };
}

async function uploadTestEvidences(parameters: {
    client: HasImportExecutionMultipartEndpoint &
        (
            | (HasGetTestRunEndpoint & HasAddEvidenceEndpoint)
            | (HasGetTestRunResultsEndpoint & HasAddEvidenceToTestRunEndpoint)
        );
    evidences: XrayEvidenceItem[];
    issueKey: string;
    splitUpload: "sequential" | boolean;
    testExecIssueKey: string;
}) {
    const uploadCallback = await getUploadCallback({
        client: parameters.client,
        testExecIssueKey: parameters.testExecIssueKey,
        testIssueKey: parameters.issueKey,
    });
    if (parameters.splitUpload === "sequential") {
        for (const evidence of parameters.evidences) {
            await uploadCallback(evidence);
        }
    } else {
        await Promise.all(parameters.evidences.map(uploadCallback));
    }
}

async function uploadEvidenceServer(
    client: HasGetTestRunEndpoint & HasAddEvidenceEndpoint,
    testRunConfig: {
        evidence: XrayEvidenceItem;
        issueKey: string;
        testExecIssueKey: string;
        testRunId: number;
    }
) {
    try {
        await client.addEvidence(testRunConfig.testRunId, testRunConfig.evidence);
    } catch (error: unknown) {
        LOG.message(
            "warning",
            dedent(`
                Failed to attach evidence of test ${testRunConfig.issueKey} to test execution ${testRunConfig.testExecIssueKey}:

                  ${unknownToString(error)}
            `)
        );
    }
}

async function uploadEvidenceCloud(
    client: HasGetTestRunResultsEndpoint & HasAddEvidenceToTestRunEndpoint,
    testRunConfig: {
        evidence: XrayEvidenceItem;
        issueKey: string;
        testExecIssueKey: string;
        testRunId: string;
    }
) {
    try {
        await client.addEvidenceToTestRun({
            evidence: [testRunConfig.evidence],
            id: testRunConfig.testRunId,
        });
    } catch (error: unknown) {
        LOG.message(
            "warning",
            dedent(`
                Failed to attach evidence of test ${testRunConfig.issueKey} to test execution ${testRunConfig.testExecIssueKey}:

                  ${unknownToString(error)}
            `)
        );
    }
}

function supportsServerEndpoints(
    client: HasImportExecutionMultipartEndpoint &
        (
            | (HasGetTestRunEndpoint & HasAddEvidenceEndpoint)
            | (HasGetTestRunResultsEndpoint & HasAddEvidenceToTestRunEndpoint)
        )
): client is HasImportExecutionMultipartEndpoint & HasGetTestRunEndpoint & HasAddEvidenceEndpoint {
    return "getTestRun" in client && "addEvidence" in client;
}

async function getUploadCallback(parameters: {
    client: HasImportExecutionMultipartEndpoint &
        (
            | (HasGetTestRunEndpoint & HasAddEvidenceEndpoint)
            | (HasGetTestRunResultsEndpoint & HasAddEvidenceToTestRunEndpoint)
        );
    testExecIssueKey: string;
    testIssueKey: string;
}): Promise<(evidence: XrayEvidenceItem) => Promise<void>> {
    if (supportsServerEndpoints(parameters.client)) {
        const serverClient: HasImportExecutionMultipartEndpoint &
            HasGetTestRunEndpoint &
            HasAddEvidenceEndpoint = parameters.client;
        const testRun = await serverClient.getTestRun({
            testExecIssueKey: parameters.testExecIssueKey,
            testIssueKey: parameters.testIssueKey,
        });
        return (evidence) =>
            uploadEvidenceServer(serverClient, {
                evidence,
                issueKey: parameters.testIssueKey,
                testExecIssueKey: parameters.testExecIssueKey,
                testRunId: testRun.id,
            });
    }
    const cloudClient: HasImportExecutionMultipartEndpoint &
        HasGetTestRunResultsEndpoint &
        HasAddEvidenceToTestRunEndpoint = parameters.client;
    const testRuns = await cloudClient.getTestRunResults({
        testExecIssueIds: [parameters.testExecIssueKey],
        testIssueIds: [parameters.testIssueKey],
    });
    return (evidence) => {
        if (testRuns.length !== 1) {
            throw new Error(
                `Failed to get test run for test execution ${parameters.testExecIssueKey} and test ${parameters.testIssueKey}`
            );
        }
        if (!testRuns[0].id) {
            throw new Error("Test run does not have an ID");
        }
        return uploadEvidenceCloud(cloudClient, {
            evidence,
            issueKey: parameters.testIssueKey,
            testExecIssueKey: parameters.testExecIssueKey,
            testRunId: testRuns[0].id,
        });
    };
}

function convertCypressTests(parameters: {
    context: {
        evidenceCollection: EvidenceCollection;
        iterationParameterCollection: IterationParameterCollection;
        screenshotCollection: ScreenshotCollection;
    };
    cypress: {
        results: CypressRunResult;
    };
    isCloudEnvironment: boolean;
    options: {
        cucumber: {
            featureFileExtension?: string;
        };
        jira: {
            projectKey: string;
        };
        plugin: {
            normalizeScreenshotNames: boolean;
            uploadLastAttempt: boolean;
        };
        xray: {
            uploadScreenshots: boolean;
            xrayStatus: InternalXrayOptions["status"];
        };
    };
}) {
    const xrayTests: XrayTest[] = [];
    const failedConversions: {
        error: unknown;
        filePath: string;
        testTitle: string;
    }[] = [];
    const nonAttributableScreenshots: string[] = [];
    const version = lt(parameters.cypress.results.cypressVersion, "13.0.0") ? "<13" : ">=13";
    const conversionResult = convertTestRuns({
        context: {
            screenshotCollection: parameters.context.screenshotCollection,
        },
        cypress: {
            results: parameters.cypress.results,
        },
        options: {
            cucumber: {
                featureFileExtension: parameters.options.cucumber.featureFileExtension,
            },
            jira: {
                projectKey: parameters.options.jira.projectKey,
            },
            plugin: {
                normalizeScreenshotNames: parameters.options.plugin.normalizeScreenshotNames,
                uploadLastAttempt: parameters.options.plugin.uploadLastAttempt,
            },
            xray: {
                uploadScreenshots: parameters.options.xray.uploadScreenshots,
            },
        },
        version: version,
    });
    const runsByKey = new Map<string, [SuccessfulConversion, ...SuccessfulConversion[]]>();
    for (const { error, spec, title } of conversionResult.failedConversions) {
        failedConversions.push({ error: error, filePath: spec.filepath, testTitle: title });
    }
    for (const nonAttributableScreenshot of conversionResult.nonAttributableScreenshots) {
        nonAttributableScreenshots.push(nonAttributableScreenshot);
    }
    for (const convertedTest of conversionResult.successfulConversions) {
        const runs = runsByKey.get(convertedTest.issueKey);
        if (runs) {
            runs.push(convertedTest);
        } else {
            runsByKey.set(convertedTest.issueKey, [convertedTest]);
        }
    }
    for (const [issueKey, testRuns] of runsByKey) {
        xrayTests.push(
            getTest({
                evidenceCollection: parameters.context.evidenceCollection,
                issueKey: issueKey,
                iterationParameterCollection: parameters.context.iterationParameterCollection,
                runs: testRuns,
                useCloudStatusFallback: parameters.isCloudEnvironment,
                xrayStatus: parameters.options.xray.xrayStatus,
            })
        );
    }
    return {
        failedConversions: failedConversions,
        nonAttributableScreenshots: nonAttributableScreenshots,
        successfulConversions: xrayTests,
    };
}

function convertTestRuns(parameters: {
    context: {
        screenshotCollection: ScreenshotCollection;
    };
    cypress: {
        results: CypressRunResult;
    };
    options: {
        cucumber: {
            featureFileExtension?: string;
        };
        jira: {
            projectKey: string;
        };
        plugin: {
            normalizeScreenshotNames: boolean;
            uploadLastAttempt: boolean;
        };
        xray: {
            uploadScreenshots: boolean;
        };
    };
    version: "<13" | ">=13";
}) {
    const cypressRuns = parameters.cypress.results.runs.filter(
        (run) =>
            !parameters.options.cucumber.featureFileExtension ||
            !run.spec.relative.endsWith(parameters.options.cucumber.featureFileExtension)
    );
    const converter: RunConverter =
        parameters.version === "<13"
            ? new RunConverterV12(
                  parameters.options.jira.projectKey,
                  cypressRuns as RunResult<"<13">[]
              )
            : new RunConverterLatest(
                  parameters.options.jira.projectKey,
                  cypressRuns as RunResult<">=14" | "13">[],
                  parameters.context.screenshotCollection.getScreenshots()
              );
    const conversions = converter.getConversions({
        onlyLastAttempt: parameters.options.plugin.uploadLastAttempt,
    });
    const successfulConversions: (SuccessfulConversion & { issueKey: string })[] = [];
    const failedConversions: FailedConversion[] = [];
    const nonAttributableScreenshots: string[] = [];
    for (const conversion of conversions) {
        if (conversion.kind === "error") {
            failedConversions.push(conversion);
            continue;
        }
        if (conversion.issueKey === null) {
            failedConversions.push({
                error: new Error(
                    dedent(`
                        Test: ${conversion.title}

                          No test issue keys found in title.

                          You can target existing test issues by adding a corresponding issue key:

                            it("${parameters.options.jira.projectKey}-123 ${conversion.title}", () => {
                              // ...
                            });

                          For more information, visit:
                          - ${HELP.plugin.guides.targetingExistingIssues}
                    `)
                ),
                kind: "error",
                spec: conversion.spec,
                title: conversion.title,
            });
            continue;
        }
        successfulConversions.push({
            ...conversion,
            issueKey: conversion.issueKey,
        });
    }
    if (parameters.options.xray.uploadScreenshots) {
        const evidence = getScreenshotEvidence(
            successfulConversions,
            converter,
            parameters.options.plugin.uploadLastAttempt,
            parameters.options.plugin.normalizeScreenshotNames
        );
        nonAttributableScreenshots.push(...evidence.nonAttributableScreenshots);
    }
    return { failedConversions, nonAttributableScreenshots, successfulConversions };
}

function getScreenshotEvidence(
    conversions: SuccessfulConversion[],
    converter: RunConverter,
    uploadLastAttempt: boolean,
    normalizeScreenshotNames: boolean
): {
    nonAttributableScreenshots: string[];
    screenshotsByIssueKey: Map<string, Required<XrayEvidenceItem>[]>;
} {
    const testIssueKeys = conversions
        .map((conversion) => conversion.issueKey)
        .filter((key) => key !== null);
    const screenshotsByIssueKey = new Map<string, Required<XrayEvidenceItem>[]>();
    for (const issueKey of new Set(testIssueKeys)) {
        const screenshots = converter.getScreenshots(issueKey, {
            onlyLastAttempt: uploadLastAttempt,
        });
        for (const screenshot of screenshots) {
            let filename = basename(screenshot);
            if (normalizeScreenshotNames) {
                filename = normalizedFilename(filename);
            }
            const evidenceItem = {
                contentType: `image/${extname(screenshot).replace(".", "")}`,
                data: encodeFile(screenshot),
                filename: filename,
            };
            const currentScreenshots = screenshotsByIssueKey.get(issueKey);
            if (currentScreenshots) {
                currentScreenshots.push(evidenceItem);
            } else {
                screenshotsByIssueKey.set(issueKey, [evidenceItem]);
            }
        }
    }
    return {
        nonAttributableScreenshots: converter.getNonAttributableScreenshots({
            onlyLastAttempt: uploadLastAttempt,
        }),
        screenshotsByIssueKey: screenshotsByIssueKey,
    };
}

function getTest(parameters: {
    evidenceCollection: EvidenceCollection;
    issueKey: string;
    iterationParameterCollection: IterationParameterCollection;
    runs: [SuccessfulConversion, ...SuccessfulConversion[]];
    useCloudStatusFallback?: boolean;
    xrayStatus: InternalXrayOptions["status"];
}): XrayTest {
    const xrayTest: XrayTest = {
        finish: truncateIsoTime(
            latestDate(
                ...parameters.runs.map((test) => new Date(test.startedAt.getTime() + test.duration))
            ).toISOString()
        ),
        start: truncateIsoTime(
            earliestDate(...parameters.runs.map((test) => test.startedAt)).toISOString()
        ),
        status: aggregateXrayStatus(
            parameters.runs,
            parameters.xrayStatus,
            parameters.useCloudStatusFallback
        ),
        testKey: parameters.issueKey,
    };
    const evidence = parameters.evidenceCollection.getEvidence(parameters.issueKey);
    if (evidence.length > 0) {
        xrayTest.evidence = evidence;
    }
    if (parameters.runs.length > 1) {
        const iterations: XrayIterationResult[] = [];
        for (const iteration of parameters.runs) {
            const definedParameters =
                parameters.iterationParameterCollection.getIterationParameters(
                    parameters.issueKey,
                    iteration.title
                );
            iterations.push({
                parameters: [
                    {
                        name: "iteration",
                        value: (iterations.length + 1).toString(),
                    },
                    ...Object.entries(definedParameters).map(([key, value]) => {
                        return {
                            name: key,
                            value: value,
                        };
                    }),
                ],
                status: getXrayCypressStatus(
                    iteration.status,
                    parameters.useCloudStatusFallback === true,
                    parameters.xrayStatus
                ),
            });
        }
        xrayTest.iterations = iterations;
    }
    return xrayTest;
}

function aggregateXrayStatus(
    tests: [SuccessfulConversion, ...SuccessfulConversion[]],
    xrayStatus: InternalXrayOptions["status"],
    useCloudStatusFallback?: boolean
): string {
    const statuses = tests.map((test) => test.status);
    if (statuses.length > 1) {
        const passed = statuses.filter((s) => s === CypressStatus.PASSED).length;
        const failed = statuses.filter((s) => s === CypressStatus.FAILED).length;
        const pending = statuses.filter((s) => s === CypressStatus.PENDING).length;
        const skipped = statuses.filter((s) => s === CypressStatus.SKIPPED).length;
        if (xrayStatus.aggregate) {
            return xrayStatus.aggregate({ failed, passed, pending, skipped });
        }
        if (passed > 0 && failed === 0 && skipped === 0) {
            return getXrayCypressStatus(
                CypressStatus.PASSED,
                useCloudStatusFallback === true,
                xrayStatus
            );
        }
        if (passed === 0 && failed === 0 && skipped === 0 && pending > 0) {
            return getXrayCypressStatus(
                CypressStatus.PENDING,
                useCloudStatusFallback === true,
                xrayStatus
            );
        }
        if (skipped > 0) {
            return getXrayCypressStatus(
                CypressStatus.SKIPPED,
                useCloudStatusFallback === true,
                xrayStatus
            );
        }
        return getXrayCypressStatus(
            CypressStatus.FAILED,
            useCloudStatusFallback === true,
            xrayStatus
        );
    }
    return getXrayCypressStatus(statuses[0], useCloudStatusFallback === true, xrayStatus);
}
