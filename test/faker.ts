import { faker as fakerjs } from "@faker-js/faker";
import ansiColors from "ansi-colors";
import type { MinimalCypressRunResult } from "../src/plugin/cypress-xray-plugin";
import type { JiraSnapshot } from "../src/plugin/jira-issue-snapshots/jira-issue-snapshots";
import type { ScreenshotDetails } from "../src/types/cypress";
import { CypressStatus } from "../src/types/cypress/status";
import type {
    XrayTest,
    XrayTestExecutionResults,
} from "../src/types/xray/import-test-execution-results";
import type { MultipartInfo } from "../src/types/xray/requests/import-execution-multipart-info";

let seed: number;
if (process.env.SEED) {
    seed = Number.parseInt(process.env.SEED);
} else {
    seed = Math.ceil(Math.random() * Number.MAX_SAFE_INTEGER);
}
console.log(
    ansiColors.cyanBright(
        `======================${"=".repeat(Number.MAX_SAFE_INTEGER.toString().length + 2)}`
    )
);
console.log(
    ansiColors.cyanBright(
        `= Faker library seed: ${seed.toString()}${" ".repeat(Number.MAX_SAFE_INTEGER.toString().length - seed.toString().length + 1)}=`
    )
);
console.log(
    ansiColors.cyanBright(
        `======================${"=".repeat(Number.MAX_SAFE_INTEGER.toString().length + 2)}`
    )
);
fakerjs.seed(seed);

export function faker() {
    return fakerjs;
}

export function generateFakeSemVer(options?: {
    major?: { max: number; min: number };
    minor?: { max: number; min: number };
    patch?: { max: number; min: number };
}) {
    if (!options?.major && !options?.minor && !options?.patch) {
        return faker().system.semver();
    }
    const major = faker().number.int(options.major);
    const minor = faker().number.int(options.minor);
    const patch = faker().number.int(options.patch);
    return `${major.toString()}.${minor.toString()}.${patch.toString()}`;
}

export function generateFakeProjectKey() {
    return faker().string.alpha({ casing: "upper", length: { max: 10, min: 2 } });
}

export function generateFakeIssueKey(options?: { projectKey?: string }) {
    if (options?.projectKey) {
        return `${options.projectKey}-${faker().number.int({ max: 9999, min: 1 }).toString()}`;
    }
    return `${generateFakeProjectKey()}-${faker().number.int({ max: 9999, min: 1 }).toString()}`;
}

/**
 * Generate an array of fake title strings, with an optional Jira issue key inserted.
 *
 * @param issueKey - whether to include the specified Jira issue key in one of the titles
 * @param count - how many titles to generate (default 3)
 * @param projectKeys - optional list of project prefixes to use for the Jira key
 *
 * @returns the generated array of title strings
 */
export function generateFakeTitles(issueKey?: string, count = 3): string[] {
    const titles = Array.from({ length: count }, () => faker().lorem.sentence());
    if (!issueKey) {
        return titles;
    }
    const targetIndex = faker().number.int({ max: count - 1, min: 0 });
    const title = titles[targetIndex];
    const insertPos = faker().number.int({ max: title.length, min: 0 });
    titles[targetIndex] = `${title.slice(0, insertPos)} ${issueKey} ${title.slice(insertPos)}`;
    return titles;
}

export function generateFakeCypressRunResultV12(options?: {
    projectKey?: string;
}): MinimalCypressRunResult<"<13"> {
    const issueKeys: string[] = [];
    return {
        browserName: faker().string.alpha(),
        browserVersion: faker().string.numeric(),
        cypressVersion: generateFakeSemVer({ major: { max: 12, min: 0 } }),
        runs: faker().helpers.multiple(
            () => {
                const rootDir = faker().system.directoryPath();
                const filePath = faker().system.filePath();
                return {
                    spec: { absolute: `${rootDir}${filePath}`, relative: `.${filePath}` },
                    tests: faker().helpers.multiple(
                        () => {
                            const issueKey = generateFakeIssueKey({
                                projectKey: options?.projectKey,
                            });
                            issueKeys.push(issueKey);
                            return {
                                attempts: faker().helpers.multiple(
                                    () => {
                                        return {
                                            duration: faker().number.int({ min: 0 }),
                                            screenshots: [{ path: faker().system.filePath() }],
                                            startedAt: faker().date.recent().toISOString(),
                                            state: faker().helpers.arrayElement([
                                                CypressStatus.FAILED,
                                                CypressStatus.PASSED,
                                                CypressStatus.PENDING,
                                                CypressStatus.SKIPPED,
                                            ]),
                                        };
                                    },
                                    { count: faker().number.int({ max: 5, min: 1 }) }
                                ),
                                title: generateFakeTitles(issueKey),
                            };
                        },
                        { count: faker().number.int({ max: 5, min: 1 }) }
                    ),
                    video: faker().datatype.boolean() ? faker().system.filePath() : null,
                };
            },
            { count: faker().number.int({ max: 5, min: 1 }) }
        ),
        startedTestsAt: faker().date.past().toISOString(),
        status: "finished",
    };
}

export function generateFakeCypressRunResultV13(options?: {
    projectKey?: string;
}): MinimalCypressRunResult<"13"> {
    const issueKeys: string[] = [];
    return {
        browserName: faker().string.alpha(),
        browserVersion: faker().string.numeric(),
        cypressVersion: generateFakeSemVer({ major: { max: 12, min: 0 } }),
        runs: faker().helpers.multiple(
            () => {
                const rootDir = faker().system.directoryPath();
                const filePath = faker().system.filePath();
                return {
                    spec: { absolute: `${rootDir}${filePath}`, relative: `.${filePath}` },
                    stats: { startedAt: faker().date.recent().toISOString() },
                    tests: faker().helpers.multiple(
                        () => {
                            const issueKey = generateFakeIssueKey({
                                projectKey: options?.projectKey,
                            });
                            issueKeys.push(issueKey);
                            return {
                                attempts: faker().helpers.multiple(
                                    () => {
                                        return {
                                            state: faker().helpers.arrayElement([
                                                CypressStatus.FAILED,
                                                CypressStatus.PASSED,
                                                CypressStatus.PENDING,
                                                CypressStatus.SKIPPED,
                                            ]),
                                        };
                                    },
                                    { count: faker().number.int({ max: 5, min: 1 }) }
                                ),
                                duration: faker().number.int({ min: 0 }),
                                state: faker().color.human(),
                                title: generateFakeTitles(issueKey),
                            };
                        },
                        { count: faker().number.int({ max: 5, min: 1 }) }
                    ),
                    video: faker().datatype.boolean() ? faker().system.filePath() : null,
                };
            },
            { count: faker().number.int({ max: 5, min: 1 }) }
        ),
        startedTestsAt: faker().date.past().toISOString(),
    };
}

export function generateFakeCypressRunResultV14(options?: {
    projectKey?: string;
}): MinimalCypressRunResult<">=14"> {
    return generateFakeCypressRunResultV13(options);
}

export function generateFakeScreenshotDetails(): ScreenshotDetails[] {
    return faker().helpers.multiple(() => {
        return {
            blackout: [],
            dimensions: {
                height: faker().number.int({ min: 0 }),
                width: faker().number.int({ min: 0 }),
                x: faker().number.int({ min: 0 }),
                y: faker().number.int({ min: 0 }),
            },
            duration: faker().number.int({ min: 0 }),
            multipart: faker().datatype.boolean(),
            name: faker().system.fileName(),
            path: faker().system.filePath(),
            pixelRatio: faker().number.int({ min: 0 }),
            scaled: faker().datatype.boolean(),
            size: faker().number.int({ min: 0 }),
            specName: faker().hacker.phrase(),
            takenAt: faker().date.recent().toISOString(),
            testFailure: faker().datatype.boolean(),
        };
    });
}

export function generateFakeXrayJsonV12(options?: {
    projectKey?: string;
    testExecutionIssueKey?: string;
}) {
    const cypressResults = generateFakeCypressRunResultV12({ projectKey: options?.projectKey });
    const xrayTests: XrayTest[] = cypressResults.runs
        .flatMap((run) => run.tests)
        .map((test) => {
            return { status: faker().helpers.arrayElement(test.attempts).state };
        });
    const results: XrayTestExecutionResults = {
        tests: [xrayTests[0], ...xrayTests.slice(1)],
    };
    if (faker().datatype.boolean()) {
        results.info = { summary: faker().book.title() };
    }
    if (options?.testExecutionIssueKey) {
        results.testExecutionKey = options.testExecutionIssueKey;
    }
    return { cypressResults, xrayJson: results };
}

export function generateFakeXrayJsonV13(options?: {
    projectKey?: string;
    testExecutionIssueKey?: string;
}) {
    const cypressResults = generateFakeCypressRunResultV13({ projectKey: options?.projectKey });
    const xrayTests: XrayTest[] = cypressResults.runs
        .flatMap((run) => run.tests)
        .map((test) => {
            return { status: faker().helpers.arrayElement(test.attempts).state };
        });
    const results: XrayTestExecutionResults = {
        tests: [xrayTests[0], ...xrayTests.slice(1)],
    };
    if (faker().datatype.boolean()) {
        results.info = { summary: faker().book.title() };
    }
    if (options?.testExecutionIssueKey) {
        results.testExecutionKey = options.testExecutionIssueKey;
    }
    return { cypressResults, xrayJson: results };
}

export function generateFakeXrayJsonV14(options?: {
    projectKey?: string;
    testExecutionIssueKey?: string;
}) {
    const cypressResults = generateFakeCypressRunResultV14({ projectKey: options?.projectKey });
    const xrayTests: XrayTest[] = cypressResults.runs
        .flatMap((run) => run.tests)
        .map((test) => {
            return { status: faker().helpers.arrayElement(test.attempts).state };
        });
    const results: XrayTestExecutionResults = {
        tests: [xrayTests[0], ...xrayTests.slice(1)],
    };
    if (faker().datatype.boolean()) {
        results.info = { summary: faker().book.title() };
    }
    if (options?.testExecutionIssueKey) {
        results.testExecutionKey = options.testExecutionIssueKey;
    }
    return { cypressResults, xrayJson: results };
}

export function generateFakeMultipartInfo(options: {
    includeRandomField?: boolean;
    projectKey: string;
}): MultipartInfo {
    return {
        fields: {
            ...(options.includeRandomField && faker().science.unit()),
            project: { key: options.projectKey },
        },
    };
}

export function generateFakeFeatureFileData(options: {
    minIssueKeysPerFeatureFile?: number;
    projectKey: string;
}) {
    return faker().helpers.multiple(
        () => {
            return {
                filePath: faker().system.filePath(),
                issueKeys: faker().helpers.multiple(
                    () => generateFakeIssueKey({ projectKey: options.projectKey }),
                    { count: { max: 3, min: options.minIssueKeysPerFeatureFile ?? 0 } }
                ),
            };
        },
        { count: { max: 5, min: 1 } }
    );
}

export function generateFakeIssueSnapshots(options: {
    generateErrors: "one-or-more" | "zero-or-more" | "zero";
    generateLabels: "one-or-more" | "zero-or-more" | "zero";
    issueKeys: string[];
    summaries?: Record<string, string>;
}): JiraSnapshot {
    return {
        errorMessages:
            options.generateErrors === "zero"
                ? []
                : faker().helpers.multiple(() => faker().company.buzzNoun(), {
                      count: { max: 3, min: options.generateErrors === "zero-or-more" ? 0 : 1 },
                  }),
        issues: options.issueKeys.map((issueKey) => {
            const summary = options.summaries?.[issueKey] ?? faker().company.buzzPhrase();
            return {
                key: issueKey,
                labels:
                    options.generateLabels === "zero"
                        ? []
                        : faker().helpers.multiple(() => faker().commerce.product(), {
                              count: {
                                  max: 5,
                                  min: options.generateLabels === "zero-or-more" ? 0 : 1,
                              },
                          }),
                summary: summary,
            };
        }),
    };
}
