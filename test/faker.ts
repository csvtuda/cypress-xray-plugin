import { faker as fakerjs } from "@faker-js/faker";
import ansiColors from "ansi-colors";
import type { MinimalCypressRunResult, MinimalRunResult } from "../src/plugin/cypress-xray-plugin";
import type { JiraSnapshot } from "../src/plugin/jira-issue-snapshots/jira-issue-snapshots";
import type { ScreenshotDetails } from "../src/types/cypress";
import { CypressStatus } from "../src/types/cypress/status";
import type { PluginIssueUpdate } from "../src/types/plugin";
import type {
    XrayTest,
    XrayTestExecutionResults,
} from "../src/types/xray/import-test-execution-results";
import type { CucumberMultipartFeature } from "../src/types/xray/requests/import-execution-cucumber-multipart";
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

export function generateFakePluginIssueUpdate(options?: {
    key?: boolean;
    transition?: boolean;
}): PluginIssueUpdate {
    return {
        fields: faker().helpers.maybe(() => {
            return {
                description: faker().helpers.maybe(() => faker().string.sample()),
                issuetype: faker().helpers.maybe(() => {
                    return { name: faker().string.sample() };
                }),
                summary: faker().helpers.maybe(() => faker().string.sample()),
            };
        }),
        ...(options?.transition && { transition: { to: { name: faker().color.human() } } }),
        ...(options?.key !== false && { key: faker().helpers.maybe(() => generateFakeIssueKey()) }),
    };
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

export function generateFakeRunResultV12(options?: {
    projectKey?: string;
    specExtensions?: string[];
}): MinimalRunResult<"<13"> {
    const rootDir = faker().system.directoryPath();
    const fileName = faker().system.fileName({ extensionCount: 0 });
    const fileExtension = options?.specExtensions
        ? faker().helpers.arrayElement(options.specExtensions)
        : faker().system.fileExt();
    return {
        spec: {
            absolute: `${rootDir}${fileName}.${fileExtension}`,
            relative: `${fileName}.${fileExtension}`,
        },
        tests: faker().helpers.multiple(
            () => {
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
                    title: generateFakeTitles(
                        generateFakeIssueKey({
                            projectKey: options?.projectKey,
                        })
                    ),
                };
            },
            { count: faker().number.int({ max: 5, min: 1 }) }
        ),
        video: faker().datatype.boolean() ? faker().system.filePath() : null,
    };
}

export function generateFakeRunResultV13(options?: {
    projectKey?: string;
    specExtensions?: string[];
}): MinimalRunResult<"13"> {
    const rootDir = faker().system.directoryPath();
    const fileName = faker().system.fileName({ extensionCount: 0 });
    const fileExtension = options?.specExtensions
        ? faker().helpers.arrayElement(options.specExtensions)
        : faker().system.fileExt();
    return {
        spec: {
            absolute: `${rootDir}${fileName}.${fileExtension}`,
            relative: `${fileName}.${fileExtension}`,
        },
        stats: { startedAt: faker().date.recent().toISOString() },
        tests: faker().helpers.multiple(
            () => {
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
                    title: generateFakeTitles(
                        generateFakeIssueKey({
                            projectKey: options?.projectKey,
                        })
                    ),
                };
            },
            { count: faker().number.int({ max: 5, min: 1 }) }
        ),
        video: faker().datatype.boolean() ? faker().system.filePath() : null,
    };
}

export function generateFakeRunResultV14(options?: {
    projectKey?: string;
    specExtensions?: string[];
}): MinimalRunResult<">=14"> {
    return generateFakeRunResultV13(options);
}

export function generateFakeCypressRunResultV12(options?: {
    projectKey?: string;
    runs?:
        | {
              max?: number;
              min?: number;
              specExtensions?: string[];
          }
        | MinimalRunResult<"<13">[];
}): MinimalCypressRunResult<"<13"> {
    const browserName = faker().string.alpha();
    const browserVersion = faker().string.numeric();
    const cypressVersion = generateFakeSemVer({ major: { max: 12, min: 0 } });
    const startedTestsAt = faker().date.past().toISOString();
    const status = "finished";
    if (Array.isArray(options?.runs)) {
        return {
            browserName: browserName,
            browserVersion: browserVersion,
            cypressVersion: cypressVersion,
            runs: options.runs,
            startedTestsAt: startedTestsAt,
            status: status,
        };
    }
    const minRuns = options?.runs?.min;
    const maxRuns = options?.runs?.max;
    const specExtensions = options?.runs?.specExtensions;
    const runs = faker().helpers.multiple(
        () =>
            generateFakeRunResultV12({
                projectKey: options?.projectKey,
                specExtensions: specExtensions,
            }),
        { count: { max: maxRuns ?? 5, min: minRuns ?? 1 } }
    );
    return {
        browserName: browserName,
        browserVersion: browserVersion,
        cypressVersion: cypressVersion,
        runs: runs,
        startedTestsAt: startedTestsAt,
        status: status,
    };
}

export function generateFakeCypressRunResultV13(options?: {
    projectKey?: string;
    runs?:
        | {
              max?: number;
              min?: number;
              specExtensions?: string[];
          }
        | MinimalRunResult<"13">[];
}): MinimalCypressRunResult<"13"> {
    const browserName = faker().string.alpha();
    const browserVersion = faker().string.numeric();
    const cypressVersion = generateFakeSemVer({ major: { max: 12, min: 0 } });
    const startedTestsAt = faker().date.past().toISOString();
    if (Array.isArray(options?.runs)) {
        return {
            browserName: browserName,
            browserVersion: browserVersion,
            cypressVersion: cypressVersion,
            runs: options.runs,
            startedTestsAt: startedTestsAt,
        };
    }
    const minRuns = options?.runs?.min;
    const maxRuns = options?.runs?.max;
    const specExtensions = options?.runs?.specExtensions;
    const runs = faker().helpers.multiple(
        () =>
            generateFakeRunResultV13({
                projectKey: options?.projectKey,
                specExtensions: specExtensions,
            }),
        { count: { max: maxRuns ?? 5, min: minRuns ?? 1 } }
    );
    return {
        browserName: browserName,
        browserVersion: browserVersion,
        cypressVersion: cypressVersion,
        runs: runs,
        startedTestsAt: startedTestsAt,
    };
}

export function generateFakeCypressRunResultV14(options?: {
    projectKey?: string;
    runs?:
        | {
              max?: number;
              min?: number;
              specExtensions?: string[];
          }
        | MinimalRunResult<">=14">[];
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
    fields?: PluginIssueUpdate["fields"];
    includeRandomField?: boolean;
    projectKey: string;
}): MultipartInfo {
    return {
        fields: {
            ...options.fields,
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

export function generateFakeCucumberMultipartFeatures(): CucumberMultipartFeature[] {
    return faker().helpers.multiple(() => {
        return {
            description: faker().commerce.productDescription(),
            elements: faker().helpers.multiple(() => {
                return {
                    description: faker().commerce.productDescription(),
                    keyword: faker().word.noun(),
                    line: faker().number.int(),
                    name: faker().person.firstName(),
                    steps: faker().helpers.multiple(() => {
                        return {
                            keyword: faker().word.noun(),
                            line: faker().number.int(),
                            name: faker().person.firstName(),
                            result: { status: faker().color.human() },
                        };
                    }),
                    type: faker().helpers.arrayElement(["background", "scenario"]),
                };
            }),
            id: faker().commerce.isbn(),
            keyword: faker().word.noun(),
            line: faker().number.int(),
            name: faker().person.firstName(),
            uri: faker().internet.url(),
        };
    });
}
