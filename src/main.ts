import path from "path";
import globalContext, {
    PluginContext,
    SimpleEvidenceCollection,
    SimpleIterationParameterCollection,
    SimpleScreenshotCollection,
} from "./context";
import type { PluginTaskParameterType } from "./cypress/tasks";
import { CypressTaskListener } from "./cypress/tasks";
import { runPlugin } from "./plugin/cypress-xray-plugin";
import type { CypressFailedRunResult, CypressRunResult } from "./types/cypress";
import type {
    CypressXrayPluginOptions,
    InternalCypressXrayPluginOptions,
    InternalPluginOptions,
} from "./types/plugin";
import { dedent } from "./util/dedent";
import { getOrCall } from "./util/functions";
import { HELP } from "./util/help";
import { CapturingLogger, LOG } from "./util/logging";

let canShowInitializationWarning = true;

/**
 * Resets the plugin including its context.
 */
export function resetPlugin(): void {
    globalContext.setGlobalContext(undefined);
    canShowInitializationWarning = true;
}

/**
 * Configures the plugin. The plugin will check all environment variables passed in
 * {@link Cypress.PluginConfigOptions.env | `config.env`} and merge them with those specified in
 * `options`. Environment variables always override values specified in `options`.
 *
 * Note: This method will register upload hooks under the following Cypress events:
 *   - `after:run`
 *   - `on:screenshot`
 *   - `task`
 *
 * Consider using [`cypress-on-fix`](https://github.com/bahmutov/cypress-on-fix) if you have these
 * hooks registered to prevent the plugin from replacing them.
 *
 * @param on - the Cypress event registration functon
 * @param config - the Cypress configuration
 * @param options - the plugin options
 *
 * @see https://csvtuda.github.io/docs/cypress-xray-plugin/guides/uploadTestResults/#setup
 */
export async function configureXrayPlugin(
    on: Cypress.PluginEvents,
    config: Cypress.PluginConfigOptions,
    options: CypressXrayPluginOptions
): Promise<void> {
    canShowInitializationWarning = false;
    // Resolve these before all other options for correct enabledness.
    const pluginOptions: InternalPluginOptions = globalContext.initPluginOptions(
        config.env,
        options.plugin
    );
    if (!pluginOptions.enabled) {
        LOG.message("info", "Plugin disabled. Skipping further configuration.");
        // Tasks must always be registered in case users forget to comment out imported commands.
        registerDefaultTasks(on);
        return;
    }
    // We should be using config.isInteractive here, but cannot currently because of a bug.
    // See: https://github.com/cypress-io/cypress/issues/20789
    if (!config.isTextTerminal) {
        pluginOptions.enabled = false;
        LOG.message("info", "Interactive mode detected, disabling plugin.");
        // Tasks must always be registered in case users forget to comment out imported commands.
        registerDefaultTasks(on);
        return;
    }
    // Init logging before all other configurations because they might require an initialized
    // logging module.
    if (!path.isAbsolute(pluginOptions.logDirectory)) {
        // Cypress might change process.cwd(), so we need to query the root directory.
        // See: https://github.com/cypress-io/cypress/issues/22689
        pluginOptions.logDirectory = path.resolve(config.projectRoot, pluginOptions.logDirectory);
    }
    LOG.configure({
        debug: pluginOptions.debug,
        logDirectory: pluginOptions.logDirectory,
        logger: pluginOptions.logger,
    });
    const internalOptions: InternalCypressXrayPluginOptions = {
        cucumber: await globalContext.initCucumberOptions(config, options.cucumber),
        http: options.http,
        jira: globalContext.initJiraOptions(config.env, options.jira),
        plugin: pluginOptions,
        xray: globalContext.initXrayOptions(config.env, options.xray),
    };
    const httpClients = globalContext.initHttpClients(internalOptions.plugin, internalOptions.http);
    const logger = new CapturingLogger();
    const context = new PluginContext(
        await globalContext.initClients(
            internalOptions.jira,
            internalOptions.xray,
            config.env,
            httpClients
        ),
        internalOptions,
        config,
        new SimpleEvidenceCollection(),
        new SimpleIterationParameterCollection(),
        new SimpleScreenshotCollection(),
        logger
    );
    globalContext.setGlobalContext(context);
    const cypressTaskListener = new CypressTaskListener(
        internalOptions.jira.projectKey,
        context,
        context,
        logger
    );
    if (options.plugin?.listener) {
        await options.plugin.listener({
            on: context.getEventEmitter().on.bind(context.getEventEmitter()),
        });
    }
    on("task", {
        ["cypress-xray-plugin:task:iteration:definition"]: (
            args: PluginTaskParameterType["cypress-xray-plugin:task:iteration:definition"]
        ) => {
            return cypressTaskListener["cypress-xray-plugin:task:iteration:definition"](args);
        },
        ["cypress-xray-plugin:task:request"]: (
            args: PluginTaskParameterType["cypress-xray-plugin:task:request"]
        ) => {
            if (internalOptions.xray.uploadRequests) {
                return cypressTaskListener["cypress-xray-plugin:task:request"](args);
            }
            return args.request;
        },
        ["cypress-xray-plugin:task:response"]: (
            args: PluginTaskParameterType["cypress-xray-plugin:task:response"]
        ) => {
            if (internalOptions.xray.uploadRequests) {
                return cypressTaskListener["cypress-xray-plugin:task:response"](args);
            }
            return args.response;
        },
    });
    on("after:screenshot", (screenshot) => {
        context.addScreenshot(screenshot);
    });
    on("after:run", async (results: CypressFailedRunResult | CypressRunResult) => {
        try {
            const { cypressResults, hasCypressFailed } = inspectResults(results);
            if (hasCypressFailed) {
                context.getLogger().message(
                    "error",
                    dedent(`
                        Skipping plugin execution: Failed to run ${cypressResults.failures.toString()} tests.

                          ${cypressResults.message}
                    `)
                );
                return;
            }
            // We need to cast here because the options are typed to always use the installed
            // Cypress results type and the plugin internally works with the intersection of result
            // types of all Cypress versions.
            // But there's basically no way for the results to not be the installed Cypress results
            // type, so it should not be a problem.
            const cypressRunResult = cypressResults as CypressCommandLine.CypressRunResult;
            const resolvedTestExecutionIssueData = await getOrCall(
                context.getOptions().jira.testExecutionIssue,
                { results: cypressRunResult }
            );
            const resolvedTestPlanIssueKey = await getOrCall(options.jira.testPlanIssueKey, {
                results: cypressRunResult,
            });
            await runPlugin({
                clients: {
                    jira: context.getClients().jiraClient,
                    xray: context.getClients().xrayClient,
                },
                context: {
                    emitter: context.getEventEmitter(),
                    featureFilePaths: context.getFeatureFiles(),
                    getEvidence: context.getEvidence.bind(context),
                    getIterationParameters: context.getIterationParameters.bind(context),
                    screenshots: context.getScreenshots(),
                },
                cypress: { config: config, results: cypressRunResult },
                isCloudEnvironment: context.getClients().kind === "cloud",
                logger: context.getLogger(),
                options: {
                    cucumber: context.getOptions().cucumber,
                    jira: {
                        attachVideos: context.getOptions().jira.attachVideos,
                        fields: {
                            testEnvironments: context.getOptions().jira.fields.testEnvironments,
                            testPlan: context.getOptions().jira.fields.testPlan,
                        },
                        projectKey: context.getOptions().jira.projectKey,
                        testExecutionIssue: {
                            ...resolvedTestExecutionIssueData,
                            fields: {
                                issuetype: {
                                    name: context.getOptions().jira.testExecutionIssueType,
                                },
                                summary: context.getOptions().jira.testExecutionIssueSummary,
                                ...resolvedTestExecutionIssueData?.fields,
                            },
                            key:
                                resolvedTestExecutionIssueData?.key ??
                                context.getOptions().jira.testExecutionIssueKey,
                            testEnvironments: context.getOptions().xray.testEnvironments,
                            testPlan: resolvedTestPlanIssueKey,
                        },
                        url: context.getOptions().jira.url,
                    },
                    plugin: {
                        normalizeScreenshotNames:
                            context.getOptions().plugin.normalizeScreenshotNames,
                        splitUpload: context.getOptions().plugin.splitUpload,
                        uploadLastAttempt: context.getOptions().plugin.uploadLastAttempt,
                    },
                    xray: {
                        status: context.getOptions().xray.status,
                        uploadResults: context.getOptions().xray.uploadResults,
                        uploadScreenshots: context.getOptions().xray.uploadScreenshots,
                    },
                },
            });
        } finally {
            const messages = logger.getMessages();
            messages.forEach(([level, text]) => {
                if (["debug", "info", "notice"].includes(level)) {
                    context.getLogger().message(level, text);
                }
            });
            if (messages.some(([level]) => level === "warning" || level === "error")) {
                context
                    .getLogger()
                    .message("warning", "Encountered problems during plugin execution!");
                messages
                    .filter(([level]) => level === "warning")
                    .forEach(([level, text]) => {
                        context.getLogger().message(level, text);
                    });
                messages
                    .filter(([level]) => level === "error")
                    .forEach(([level, text]) => {
                        context.getLogger().message(level, text);
                    });
            }
            logger.getFileLogErrorMessages().forEach(([error, filename]) => {
                context.getLogger().logErrorToFile(error, filename);
            });
            logger.getFileLogMessages().forEach(([data, filename]) => {
                context.getLogger().logToFile(data, filename);
            });
        }
    });
}

/**
 * Attempts to synchronize the Cucumber feature file with Xray. If the filename does not end with
 * the configured {@link https://csvtuda.github.io/docs/cypress-xray-plugin/configuration/cucumber/#featurefileextension | feature file extension},
 * this method will not upload anything to Xray.
 *
 * @param file - the Cypress file object
 * @returns the unmodified file's path
 */
export function syncFeatureFile(file: Cypress.FileObject): string {
    const context = globalContext.getGlobalContext();
    if (!context) {
        if (canShowInitializationWarning) {
            LOG.message(
                "warning",
                dedent(`
                    ${file.filePath}

                      Skipping file:preprocessor hook: Plugin misconfigured: configureXrayPlugin() was not called.

                      Make sure your project is set up correctly: ${HELP.plugin.configuration.introduction}
                `)
            );
        }
        return file.filePath;
    }
    if (!context.getOptions().plugin.enabled) {
        LOG.message(
            "info",
            dedent(`
                ${file.filePath}

                  Plugin disabled. Skipping feature file synchronization.
            `)
        );
        return file.filePath;
    }
    const cucumberOptions = context.getOptions().cucumber;
    if (
        cucumberOptions &&
        file.filePath.endsWith(cucumberOptions.featureFileExtension) &&
        cucumberOptions.uploadFeatures
    ) {
        context.addFeatureFile(file.filePath);
    }
    return file.filePath;
}

function registerDefaultTasks(on: Cypress.PluginEvents) {
    on("task", {
        ["cypress-xray-plugin:task:iteration:definition"]: (
            args: PluginTaskParameterType["cypress-xray-plugin:task:iteration:definition"]
        ) => args.parameters,
        ["cypress-xray-plugin:task:request"]: (
            args: PluginTaskParameterType["cypress-xray-plugin:task:request"]
        ) => args.request,
        ["cypress-xray-plugin:task:response"]: (
            args: PluginTaskParameterType["cypress-xray-plugin:task:response"]
        ) => args.response,
    });
}

function inspectResults(
    results: CypressFailedRunResult | CypressRunResult
):
    | { cypressResults: CypressFailedRunResult; hasCypressFailed: true }
    | { cypressResults: CypressRunResult; hasCypressFailed: false } {
    if ("status" in results && results.status === "failed") {
        return { cypressResults: results, hasCypressFailed: true };
    }
    return { cypressResults: results, hasCypressFailed: false };
}
