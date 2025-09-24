import type { HasImportExecutionMultipartEndpoint } from "../../../../client/xray/xray-client";
import type {
    HasAddEvidenceToTestRunEndpoint,
    HasGetTestRunResultsEndpoint,
} from "../../../../client/xray/xray-client-cloud";
import type {
    HasAddEvidenceEndpoint,
    HasGetTestRunEndpoint,
} from "../../../../client/xray/xray-client-server";
import type { PluginEventEmitter } from "../../../../context";
import type { XrayEvidenceItem } from "../../../../types/xray/import-test-execution-results";
import { dedent } from "../../../../util/dedent";
import { LOG, type Logger } from "../../../../util/logging";
import { unknownToString } from "../../../../util/string";
import type { Computable } from "../../../command";
import { Command } from "../../../command";

interface CommandParameters {
    client: HasImportExecutionMultipartEndpoint &
        (
            | (HasGetTestRunEndpoint & HasAddEvidenceEndpoint)
            | (HasGetTestRunResultsEndpoint & HasAddEvidenceToTestRunEndpoint)
        );
    emitter: PluginEventEmitter;
    splitUpload: "sequential" | boolean;
}

export class ImportExecutionCypressCommand extends Command<string, CommandParameters> {
    private readonly execution: Computable<
        Parameters<HasImportExecutionMultipartEndpoint["importExecutionMultipart"]>
    >;
    constructor(
        parameters: CommandParameters,
        logger: Logger,
        execution: Computable<
            Parameters<HasImportExecutionMultipartEndpoint["importExecutionMultipart"]>
        >
    ) {
        super(parameters, logger);
        this.execution = execution;
    }

    protected async computeResult(): Promise<string> {
        const [results, info] = await this.execution.compute();
        let testExecutionIssueKey: string;
        if (this.parameters.splitUpload) {
            const evidencyByTestIssue = new Map<string, XrayEvidenceItem[]>();
            if (results.tests) {
                for (const test of results.tests) {
                    if (test.testKey && test.evidence) {
                        evidencyByTestIssue.set(test.testKey, test.evidence);
                        delete test.evidence;
                    }
                }
            }
            testExecutionIssueKey = await this.parameters.client.importExecutionMultipart(
                results,
                info
            );
            const entries = [...evidencyByTestIssue.entries()];
            const uploadCallbacks = entries.map(async ([issueKey, evidences]) => {
                try {
                    await this.uploadTestEvidences(issueKey, testExecutionIssueKey, evidences);
                } catch (error: unknown) {
                    LOG.message(
                        "warning",
                        dedent(`
                            Failed to attach evidences of test ${issueKey} to test execution ${testExecutionIssueKey}:

                              ${unknownToString(error)}
                        `)
                    );
                }
            });
            await Promise.all(uploadCallbacks);
        } else {
            testExecutionIssueKey = await this.parameters.client.importExecutionMultipart(
                results,
                info
            );
        }
        await this.parameters.emitter.emit("upload:cypress", {
            info,
            results,
            testExecutionIssueKey,
        });
        return testExecutionIssueKey;
    }

    private async uploadTestEvidences(
        issueKey: string,
        testExecIssueKey: string,
        evidences: XrayEvidenceItem[]
    ) {
        const uploadCallback = await this.getUploadCallback(testExecIssueKey, issueKey);
        if (this.parameters.splitUpload === "sequential") {
            for (const evidence of evidences) {
                await uploadCallback(evidence);
            }
        } else {
            await Promise.all(evidences.map(uploadCallback));
        }
    }

    private async uploadEvidenceServer(
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

    private async uploadEvidenceCloud(
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

    private supportsServerEndpoints(
        client: CommandParameters["client"]
    ): client is HasImportExecutionMultipartEndpoint &
        HasGetTestRunEndpoint &
        HasAddEvidenceEndpoint {
        return "getTestRun" in client && "addEvidence" in client;
    }

    private async getUploadCallback(
        testExecIssueKey: string,
        testIssueKey: string
    ): Promise<(evidence: XrayEvidenceItem) => Promise<void>> {
        if (this.supportsServerEndpoints(this.parameters.client)) {
            const serverClient: HasImportExecutionMultipartEndpoint &
                HasGetTestRunEndpoint &
                HasAddEvidenceEndpoint = this.parameters.client;
            const testRun = await serverClient.getTestRun({
                testExecIssueKey: testExecIssueKey,
                testIssueKey: testIssueKey,
            });
            return (evidence) =>
                this.uploadEvidenceServer(serverClient, {
                    evidence,
                    issueKey: testIssueKey,
                    testExecIssueKey,
                    testRunId: testRun.id,
                });
        }
        const cloudClient: HasImportExecutionMultipartEndpoint &
            HasGetTestRunResultsEndpoint &
            HasAddEvidenceToTestRunEndpoint = this.parameters.client;
        const testRuns = await cloudClient.getTestRunResults({
            testExecIssueIds: [testExecIssueKey],
            testIssueIds: [testIssueKey],
        });
        return (evidence) => {
            if (testRuns.length !== 1) {
                throw new Error(
                    `Failed to get test run for test execution ${testExecIssueKey} and test ${testIssueKey}`
                );
            }
            if (!testRuns[0].id) {
                throw new Error("Test run does not have an ID");
            }
            return this.uploadEvidenceCloud(cloudClient, {
                evidence,
                issueKey: testIssueKey,
                testExecIssueKey,
                testRunId: testRuns[0].id,
            });
        };
    }
}
