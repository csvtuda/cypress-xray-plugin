import type { AxiosResponse } from "axios";
import type { SearchRequestCloud } from "../../models/jira/requests/search.js";
import type { Issue } from "../../models/jira/responses/issue.js";
import type { SearchResultsCloud } from "../../models/jira/responses/search-results.js";
import { LOG } from "../../util/logging.js";
import { loggedRequest } from "../util.js";
import { BaseJiraClient } from "./base-jira-client.js";
import type { HasSearchEndpoint } from "./jira-client.js";

/**
 * A Jira client class for communicating with Jira Cloud instances.
 */
export class JiraClientCloud extends BaseJiraClient implements HasSearchEndpoint {
    @loggedRequest({ purpose: "search issues" })
    public async search(request: SearchRequestCloud): Promise<Issue[]> {
        const header = await this.credentials.getAuthorizationHeader();
        LOG.message("debug", "Searching issues...");
        const results: Record<string, Issue> = {};
        let isLast: boolean;
        let nextPageToken = undefined;
        do {
            const paginatedRequest = { ...request, nextPageToken };
            const response: AxiosResponse<SearchResultsCloud> = await this.httpClient.post(
                `${this.apiBaseUrl}/rest/api/latest/search/jql`,
                paginatedRequest,
                {
                    headers: {
                        ...header,
                    },
                }
            );
            if (response.data.issues) {
                for (const issue of response.data.issues) {
                    if (issue.key) {
                        results[issue.key] = issue;
                    }
                }
            }
            nextPageToken = response.data.nextPageToken;
            isLast = response.data.isLast;
        } while (nextPageToken || !isLast);
        const issues = Object.values(results);
        LOG.message("debug", `Found ${issues.length.toString()} issues`);
        return issues;
    }
}
