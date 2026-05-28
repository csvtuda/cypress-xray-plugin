import ansiColors from "ansi-colors";
import { Version2Client, Version3Client } from "jira.js";
import type { Issue as IssueVersion2 } from "jira.js/version2/models/issue";
import type { SearchAndReconcileResults as SearchAndReconcileResultsVersion2 } from "jira.js/version2/models/searchAndReconcileResults";
import type { Issue as IssueVersion3 } from "jira.js/version3/models/issue";
import type { SearchAndReconcileResults as SearchAndReconcileResultsVersion3 } from "jira.js/version3/models/searchAndReconcileResults";
import assert from "node:assert";
import { setTimeout } from "node:timers/promises";

// eslint-disable-next-line @typescript-eslint/naming-convention
const { dedent } = await import("../../src/util/dedent.js");

export function getCreatedTestExecutionIssueKey(
    projectKey: string,
    output: string[],
    uploadType: "both" | "cucumber" | "cypress"
): string {
    let regex: RegExp;
    switch (uploadType) {
        case "both":
            regex = new RegExp(`Uploaded test results to issue: (${projectKey}-\\d+)`);
            break;
        case "cucumber":
            regex = new RegExp(`Uploaded Cucumber test results to issue: (${projectKey}-\\d+)`);
            break;
        case "cypress":
            regex = new RegExp(`Uploaded Cypress test results to issue: (${projectKey}-\\d+)`);
            break;
    }
    const createdIssueLine = output.find((line) => regex.test(line))?.match(regex);
    if (!createdIssueLine || createdIssueLine.length === 0) {
        throw new Error(
            dedent(`
                Failed to find test execution issue key in output using pattern: ${regex.toString()}

                    output:

                        ${output.join("\n")}
            `)
        );
    }
    return createdIssueLine[1];
}

/**
 * Searches Jira issues by issue key and waits until all requested issues and fields are available.
 *
 * This function retries the Jira search with exponential backoff because newly created or recently
 * updated issues may not be immediately searchable due to Jira indexing delays.
 *
 * The function validates that:
 * - all requested issue keys are returned
 * - all requested fields are present on every returned issue
 *
 * @param client - Jira API client instance used to execute the search request
 * @param issueKeys - list of Jira issue keys to search for
 * @param options - additional search options
 *
 * @returns The matching Jira issues once all requested issues and fields are available.
 */
export async function searchIssues(
    client: Version2Client | Version3Client,
    issueKeys: readonly string[],
    options?: {
        /**
         * Jira fields that must be returned for every issue.
         */
        fields?: string[];
        /**
         * An optional logging function to log progress.
         *
         * @param message - The message to log.
         */
        logger?: (message: string) => void;
    }
): Promise<(IssueVersion2 | IssueVersion3)[]> {
    const sortedIssueKeys = sortJiraIssueKeys(issueKeys);
    if (options?.logger) {
        options.logger(ansiColors.gray(`Searching for Jira issues: ${sortedIssueKeys.join(", ")}`));
    }
    assert.ok(issueKeys.length > 0, "At least one issue key must be provided.");
    const maxAttempts = 6;
    const responses = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const delaySeconds = 1 << (attempt - 1);
        const delayMilliseconds = delaySeconds * 1000;
        try {
            const searchResult = await searchIssuesAndVerifyResponse(
                client,
                sortedIssueKeys,
                options
            );
            responses.push(searchResult);
            return sortByIssueKeyOrder<IssueVersion2 | IssueVersion3>(
                issueKeys,
                searchResult.issues
            );
        } catch (error: unknown) {
            if (options?.logger) {
                options.logger(
                    ansiColors.gray(
                        [
                            `Jira search attempt ${attempt.toString()}/${(maxAttempts + 1).toString()} failed, retrying in ${delaySeconds.toString()} second(s)`,
                            `Reason: ${error instanceof Error ? error.message : String(error)}`,
                        ].join("\n")
                    )
                );
            }
            await setTimeout(delayMilliseconds);
        }
    }
    throw new Error(
        [
            `Failed to verify availability of Jira issues: ${issueKeys.join(", ")}`,
            `Responses: ${JSON.stringify(responses, null, 2)}`,
        ].join("\n")
    );
}

function sortByIssueKeyOrder<T extends { key: string }>(
    order: readonly string[],
    items: readonly T[]
): T[] {
    const rank = new Map<string, number>();
    order.forEach((key, index) => {
        rank.set(key, index);
    });
    return [...items].sort((a, b) => {
        const aRank = rank.get(a.key);
        const bRank = rank.get(b.key);
        if (aRank === undefined && bRank === undefined) return 0;
        if (aRank === undefined) return 1;
        if (bRank === undefined) return -1;
        return aRank - bRank;
    });
}

type IssueSearchResult =
    | (SearchAndReconcileResultsVersion2 & { issues: IssueVersion2[] })
    | (SearchAndReconcileResultsVersion3 & { issues: IssueVersion3[] });

async function searchIssuesAndVerifyResponse(
    client: Version2Client | Version3Client,
    issueKeys: readonly string[],
    options:
        | {
              /**
               * Jira fields that must be returned for every issue.
               */
              fields?: string[];
              /**
               * An optional logging function to log progress.
               *
               * @param message - The message to log.
               */
              logger?: (message: string) => void;
          }
        | undefined
): Promise<IssueSearchResult> {
    const jql = `issue in (${issueKeys.join(",")})`;
    let issueData;
    if (client instanceof Version3Client) {
        issueData = await client.issueSearch.searchForIssuesUsingJqlEnhancedSearchPost({
            fields: [...(options?.fields ?? []), "key"],
            jql,
        });
    } else if (client instanceof Version2Client) {
        issueData = await client.issueSearch.searchForIssuesUsingJqlPost({
            fields: [...(options?.fields ?? []), "key"],
            jql,
        });
    } else {
        throw new TypeError(`Unsupported Jira client type: ${String(client)}`);
    }
    assert.ok(issueData.issues, `No issues were returned: ${JSON.stringify(issueData, null, 2)}`);
    assert.deepStrictEqual(
        issueKeys,
        sortJiraIssueKeys(issueData.issues.map((issue) => issue.key))
    );
    if (options?.fields !== undefined) {
        for (const issue of issueData.issues) {
            for (const field of options.fields) {
                if (["id", "key"].includes(field)) {
                    continue;
                }
                assert.ok(
                    field in issue.fields,
                    `Response of issue ${issue.key} does not contain a value for field ${field}: ${JSON.stringify(issue, null, 2)}`
                );
            }
        }
    }
    if (options?.logger) {
        options.logger(
            ansiColors.gray(`Successfully received data for issues: ${issueKeys.join(", ")}`)
        );
    }
    return issueData as IssueSearchResult;
}

function sortJiraIssueKeys(issueKeys: readonly string[]): string[] {
    return [...issueKeys].sort((a, b) => {
        const [aProject, aNumberRaw] = a.split("-");
        const [bProject, bNumberRaw] = b.split("-");
        const aNumber = Number.parseInt(aNumberRaw);
        const bNumber = Number.parseInt(bNumberRaw);
        // 1. Sort by project key (alphabetically).
        const projectCompare = aProject.localeCompare(bProject);
        if (projectCompare !== 0) {
            return projectCompare;
        }
        // 2. Sort by issue number (numerically).
        return aNumber - bNumber;
    });
}

export function shouldRunIntegrationTests(environment: "cloud" | "server"): boolean {
    if (process.env.INTEGRATION_TESTS_ENVIRONMENT) {
        return process.env.INTEGRATION_TESTS_ENVIRONMENT === environment;
    }
    return true;
}
