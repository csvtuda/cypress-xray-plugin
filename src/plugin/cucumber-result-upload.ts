import type { HasImportExecutionCucumberMultipartEndpoint } from "../client/xray/xray-client";
import type { CucumberMultipartFeature } from "../types/xray/requests/import-execution-cucumber-multipart";
import type { MultipartInfo } from "../types/xray/requests/import-execution-multipart-info";

export async function uploadCucumberResults(parameters: {
    client: HasImportExecutionCucumberMultipartEndpoint;
    cucumberJson: CucumberMultipartFeature[];
    multipartInfo: MultipartInfo;
}) {
    const testExecutionIssueKey = await parameters.client.importExecutionCucumberMultipart(
        parameters.cucumberJson,
        parameters.multipartInfo
    );
    return {
        testExecutionIssueKey: testExecutionIssueKey,
    };
}
