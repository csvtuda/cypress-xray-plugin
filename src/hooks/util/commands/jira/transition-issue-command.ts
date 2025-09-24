import type { HasTransitionIssueEndpoint } from "../../../../client/jira/jira-client";
import type { IssueTransition } from "../../../../types/jira/responses/issue-transition";
import type { Logger } from "../../../../util/logging";
import type { Computable } from "../../../command";
import { Command } from "../../../command";

interface Parameters {
    client: HasTransitionIssueEndpoint;
    transition: IssueTransition;
}

export class TransitionIssueCommand extends Command<void, Parameters> {
    private readonly resolvedExecutionIssueKey: Computable<string>;
    constructor(
        parameters: Parameters,
        logger: Logger,
        resolvedExecutionIssueKey: Computable<string>
    ) {
        super(parameters, logger);
        this.resolvedExecutionIssueKey = resolvedExecutionIssueKey;
    }

    protected async computeResult(): Promise<void> {
        const resolvedExecutionIssueKey = await this.resolvedExecutionIssueKey.compute();
        this.logger.message(
            "info",
            `Transitioning test execution issue ${resolvedExecutionIssueKey}`
        );
        await this.parameters.client.transitionIssue(resolvedExecutionIssueKey, {
            transition: this.parameters.transition,
        });
    }
}
