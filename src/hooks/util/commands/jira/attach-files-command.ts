import type { HasAddAttachmentEndpoint } from "../../../../client/jira/jira-client";
import type { Attachment } from "../../../../types/jira/responses/attachment";
import type { Logger } from "../../../../util/logging";
import type { Computable } from "../../../command";
import { Command } from "../../../command";

interface Parameters {
    client: HasAddAttachmentEndpoint;
}

export class AttachFilesCommand extends Command<Attachment[], Parameters> {
    private readonly files: Computable<string[]>;
    private readonly resolvedExecutionIssueKey: Computable<string>;
    constructor(
        parameters: Parameters,
        logger: Logger,
        files: Computable<string[]>,
        resolvedExecutionIssueKey: Computable<string>
    ) {
        super(parameters, logger);
        this.files = files;
        this.resolvedExecutionIssueKey = resolvedExecutionIssueKey;
    }

    protected async computeResult(): Promise<Attachment[]> {
        const resolvedExecutionIssueKey = await this.resolvedExecutionIssueKey.compute();
        const files = await this.files.compute();
        if (files.length === 0) {
            return [];
        }
        this.logger.message(
            "info",
            `Attaching files to test execution issue ${resolvedExecutionIssueKey}`
        );
        return await this.parameters.client.addAttachment(resolvedExecutionIssueKey, ...files);
    }
}
