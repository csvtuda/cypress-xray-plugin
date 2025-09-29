import { readFile } from "node:fs/promises";
import path from "node:path";
import type { HasImportExecutionCucumberMultipartEndpoint } from "../client/xray/xray-client";
import type {
    CucumberMultipartElement,
    CucumberMultipartFeature,
    CucumberMultipartStep,
    CucumberMultipartTag,
} from "../types/xray/requests/import-execution-cucumber-multipart";
import type { MultipartInfo } from "../types/xray/requests/import-execution-multipart-info";
import { dedent } from "../util/dedent";
import { errorMessage, missingTestKeyInCucumberScenarioError } from "../util/errors";
import type { Logger } from "../util/logging";
import { getScenarioTagRegex } from "./feature-file-processing/scenario";
import { getXrayStatus as getXrayCucumberStatus } from "./results-conversion/util/status";

export async function uploadCucumberResults(parameters: {
    client: HasImportExecutionCucumberMultipartEndpoint;
    cypress: {
        config: {
            projectRoot: string;
        };
    };
    cypressExecutionIssueKey?: string;
    isCloudEnvironment: boolean;
    logger: Logger;
    multipartInfo: MultipartInfo;
    options: {
        cucumber: {
            prefixes: {
                test?: string;
            };
            reportPath?: string;
        };
        jira: {
            projectKey: string;
            testExecutionIssue: {
                key?: string;
            };
        };
        xray: {
            status?: {
                failed?: string;
                passed?: string;
                pending?: string;
                skipped?: string;
            };
            uploadScreenshots: boolean;
        };
    };
}) {
    if (!parameters.options.cucumber.reportPath) {
        throw new Error(
            "Failed to prepare Cucumber upload: Cucumber preprocessor JSON report path not configured."
        );
    }
    const cucumberResults = await readCucumberResults({
        cucumberReportPath: parameters.options.cucumber.reportPath,
        projectRoot: parameters.cypress.config.projectRoot,
    });
    const convertedResults = convertCucumberFeatures({
        cucumberResults: cucumberResults,
        cypressResultExecutionIssueKey: parameters.cypressExecutionIssueKey,
        predefinedExecutionIssueKey: parameters.options.jira.testExecutionIssue.key,
        projectKey: parameters.options.jira.projectKey,
        projectRoot: parameters.cypress.config.projectRoot,
        testPrefix: parameters.options.cucumber.prefixes.test,
        uploadScreenshots: parameters.options.xray.uploadScreenshots,
        useCloudTags: parameters.isCloudEnvironment,
        xrayStepStatusOptions: parameters.options.xray.status,
    });
    for (const { element, error, filePath } of convertedResults.errors) {
        const elementDescription = `${element.type[0].toUpperCase()}${element.type.substring(
            1
        )}: ${element.name.length > 0 ? element.name : "<no name>"}`;
        parameters.logger.message(
            "warning",
            dedent(`
                ${filePath}

                  ${elementDescription}

                    Skipping result upload.

                      Caused by: ${errorMessage(error)}
            `)
        );
    }
    const testExecutionIssueKey = await parameters.client.importExecutionCucumberMultipart(
        convertedResults.features,
        parameters.multipartInfo
    );
    return {
        features: convertedResults.features,
        testExecutionIssueKey: testExecutionIssueKey,
    };
}

async function readCucumberResults(parameters: {
    cucumberReportPath: string;
    projectRoot: string;
}) {
    // Cypress might change process.cwd(), so we need to query the root directory.
    // See: https://github.com/cypress-io/cypress/issues/22689
    const reportPath = path.resolve(parameters.projectRoot, parameters.cucumberReportPath);
    const fileContent = await readFile(reportPath, "utf-8");
    return JSON.parse(fileContent) as CucumberMultipartFeature[];
}

function convertCucumberFeatures(parameters: {
    cucumberResults: CucumberMultipartFeature[];
    cypressResultExecutionIssueKey?: string;
    predefinedExecutionIssueKey?: string;
    projectKey: string;
    projectRoot: string;
    testPrefix?: string;
    uploadScreenshots: boolean;
    useCloudTags?: boolean;
    xrayStepStatusOptions?: {
        failed?: string;
        passed?: string;
        pending?: string;
        skipped?: string;
    };
}) {
    let testExecutionIssueKey;
    if (parameters.cypressResultExecutionIssueKey) {
        testExecutionIssueKey = parameters.cypressResultExecutionIssueKey;
    } else {
        testExecutionIssueKey = parameters.predefinedExecutionIssueKey;
    }
    const features: CucumberMultipartFeature[] = [];
    const errors: { element: CucumberMultipartElement; error: unknown; filePath: string }[] = [];
    for (const result of parameters.cucumberResults) {
        const test: CucumberMultipartFeature = {
            ...result,
        };
        if (testExecutionIssueKey) {
            const testExecutionIssueTag: CucumberMultipartTag = {
                name: `@${testExecutionIssueKey}`,
            };
            // Xray uses the first encountered issue tag for deducing the test execution issue.
            // Note: The tag is a feature tag, not a scenario tag!
            if (result.tags) {
                test.tags = [testExecutionIssueTag, ...result.tags];
            } else {
                test.tags = [testExecutionIssueTag];
            }
        }
        const elements: CucumberMultipartElement[] = [];
        for (const element of result.elements) {
            const filePath = path.resolve(parameters.projectRoot, result.uri);
            try {
                if (element.type === "scenario") {
                    assertScenarioContainsIssueKey({
                        element: element,
                        projectKey: parameters.projectKey,
                        testPrefix: parameters.testPrefix,
                        useCloudTags: parameters.useCloudTags,
                    });
                    const modifiedElement: CucumberMultipartElement = {
                        ...element,
                        steps: getSteps({
                            element: element,
                            uploadScreenshots: parameters.uploadScreenshots,
                            xrayStepStatusOptions: parameters.xrayStepStatusOptions,
                        }),
                    };
                    elements.push(modifiedElement);
                }
            } catch (error: unknown) {
                errors.push({ element, error, filePath });
            }
        }
        if (elements.length > 0) {
            test.elements = elements;
            features.push(test);
        }
    }
    return { errors, features };
}

function getSteps(parameters: {
    element: CucumberMultipartElement;
    uploadScreenshots: boolean;
    xrayStepStatusOptions?: {
        failed?: string;
        passed?: string;
        pending?: string;
        skipped?: string;
    };
}): CucumberMultipartStep[] {
    const steps: CucumberMultipartStep[] = [];
    parameters.element.steps.forEach((step: CucumberMultipartStep) => {
        steps.push({
            ...step,
            embeddings: parameters.uploadScreenshots ? step.embeddings : [],
            result: {
                ...step.result,
                status: getXrayCucumberStatus(step.result.status, parameters.xrayStepStatusOptions),
            },
        });
    });
    return steps;
}

function assertScenarioContainsIssueKey(parameters: {
    element: CucumberMultipartElement;
    projectKey: string;
    testPrefix?: string;
    useCloudTags?: boolean;
}): void {
    const issueKeys: string[] = [];
    if (parameters.element.tags) {
        for (const tag of parameters.element.tags) {
            const matches = tag.name.match(
                getScenarioTagRegex(parameters.projectKey, parameters.testPrefix)
            );
            if (!matches) {
                continue;
            }
            // We know the regex: the match will contain the value in the first group.
            issueKeys.push(matches[1]);
        }
    }
    if (issueKeys.length === 0) {
        throw missingTestKeyInCucumberScenarioError(
            {
                keyword: parameters.element.keyword,
                name: parameters.element.name,
                steps: parameters.element.steps.map((step: CucumberMultipartStep) => {
                    return { keyword: step.keyword, text: step.name };
                }),
                tags: parameters.element.tags,
            },
            parameters.projectKey,
            parameters.useCloudTags === true
        );
    }
}
