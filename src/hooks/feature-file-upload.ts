import type { HasEditIssueEndpoint, HasSearchEndpoint } from "../client/jira/jira-client";
import type { HasImportFeatureEndpoint } from "../client/xray/xray-client";
import { dedent } from "../util/dedent";
import { errorMessage } from "../util/errors";
import { HELP } from "../util/help";
import type { Logger } from "../util/logging";
import { computeOverlap } from "../util/set";
import type { FeatureFileData } from "./feature-file-processing";

export async function uploadFeatureFiles(parameters: {
    clients: {
        jira: HasSearchEndpoint & HasEditIssueEndpoint;
        xray: HasImportFeatureEndpoint;
    };
    logger: Logger;
    options: {
        jira: {
            projectKey: string;
        };
    };
    processedFeatureFiles: FeatureFileData[];
}) {
    const uploadAttempts = await Promise.allSettled(
        parameters.processedFeatureFiles.map((featureFile) =>
            importFeatureFile({
                featureFile: featureFile,
                jiraClient: parameters.clients.jira,
                projectKey: parameters.options.jira.projectKey,
                xrayClient: parameters.clients.xray,
            })
        )
    );
    for (const uploadAttempt of uploadAttempts.filter((attempt) => attempt.status === "rejected")) {
        parameters.logger.message("error", errorMessage(uploadAttempt.reason));
    }
    const successfulUploads = uploadAttempts
        .filter((result) => result.status === "fulfilled")
        .map((attempt) => attempt.value);
    for (const brokenAttempt of successfulUploads.filter(
        (attempt) =>
            attempt.mismatches.onlyInFeatureFile.length > 0 ||
            attempt.mismatches.onlyInXray.length > 0
    )) {
        const mismatchLinesFeatures: string[] = [];
        const mismatchLinesJira: string[] = [];
        if (brokenAttempt.mismatches.onlyInFeatureFile.length > 0) {
            mismatchLinesFeatures.push(
                "Issues contained in feature file tags that have not been updated by Xray and may not exist:"
            );
            mismatchLinesFeatures.push("");
            mismatchLinesFeatures.push(
                ...brokenAttempt.mismatches.onlyInFeatureFile.map((issueKey) => `  ${issueKey}`)
            );
        }
        if (brokenAttempt.mismatches.onlyInXray.length > 0) {
            mismatchLinesJira.push(
                "Issues updated by Xray that do not exist in feature file tags and may have been created:"
            );
            mismatchLinesJira.push("");
            mismatchLinesJira.push(
                ...brokenAttempt.mismatches.onlyInXray.map((issueKey) => `  ${issueKey}`)
            );
        }
        let mismatchLines: string;
        if (mismatchLinesFeatures.length > 0 && mismatchLinesJira.length > 0) {
            mismatchLines = dedent(`
                    ${mismatchLinesFeatures.join("\n")}

                    ${mismatchLinesJira.join("\n")}
                `);
        } else if (mismatchLinesFeatures.length > 0) {
            mismatchLines = mismatchLinesFeatures.join("\n");
        } else {
            mismatchLines = mismatchLinesJira.join("\n");
        }
        parameters.logger.message(
            "warning",
            dedent(`
                ${brokenAttempt.filePath}

                  Mismatch between feature file issue tags and updated Jira issues detected.

                    ${mismatchLines}

                  Make sure that:
                  - All issues present in feature file tags belong to existing issues.
                  - Your plugin tag prefix settings match those defined in Xray.

                  More information:
                  - ${HELP.plugin.guides.targetingExistingIssues}
                  - ${HELP.plugin.configuration.cucumber.prefixes}
            `)
        );
    }
    return successfulUploads;
}

async function importFeatureFile(parameters: {
    featureFile: FeatureFileData;
    jiraClient: HasSearchEndpoint & HasEditIssueEndpoint;
    projectKey: string;
    xrayClient: HasImportFeatureEndpoint;
}) {
    const importResult = await parameters.xrayClient.importFeature(
        parameters.featureFile.filePath,
        {
            projectKey: parameters.projectKey,
        }
    );
    return {
        ...getAffectedIssues(
            parameters.featureFile.allIssueKeys,
            importResult.updatedOrCreatedIssues
        ),
        filePath: parameters.featureFile.filePath,
    };
}

function getAffectedIssues(expectedIssues: string[], actualIssues: string[]) {
    const setOverlap = computeOverlap(expectedIssues, actualIssues);
    return {
        affectedIssues: setOverlap.intersection,
        mismatches: {
            onlyInFeatureFile: setOverlap.leftOnly,
            onlyInXray: setOverlap.rightOnly,
        },
    };
}
