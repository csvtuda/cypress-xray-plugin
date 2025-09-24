import type { HasGetFieldsEndpoint } from "../../../../client/jira/jira-client";
import type { FieldDetail } from "../../../../types/jira/responses/field-detail";
import { Command } from "../../../command";

interface Parameters {
    client: HasGetFieldsEndpoint;
}

export class FetchAllFieldsCommand extends Command<FieldDetail[], Parameters> {
    protected async computeResult(): Promise<FieldDetail[]> {
        return await this.parameters.client.getFields();
    }
}
