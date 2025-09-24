import type { HasGetIssueTypesEndpoint } from "../../../../client/jira/jira-client";
import type { IssueTypeDetails } from "../../../../types/jira/responses/issue-type-details";
import { Command } from "../../../command";

interface Parameters {
    client: HasGetIssueTypesEndpoint;
}

export class FetchIssueTypesCommand extends Command<IssueTypeDetails[], Parameters> {
    protected async computeResult(): Promise<IssueTypeDetails[]> {
        return await this.parameters.client.getIssueTypes();
    }
}
