import type { HasAddAttachmentEndpoint } from "../client/jira/jira-client";
import type { CypressRunResult } from "../types/cypress";

export async function uploadVideos(parameters: {
    client: HasAddAttachmentEndpoint;
    cypress: { results: CypressRunResult };
    options: {
        jira: {
            testExecutionIssueKey: string;
        };
    };
}) {
    const videos = parameters.cypress.results.runs
        .map((run) => run.video)
        .filter((value) => typeof value === "string");
    if (videos.length === 0) {
        return [];
    }
    return await parameters.client.addAttachment(
        parameters.options.jira.testExecutionIssueKey,
        ...videos
    );
}
