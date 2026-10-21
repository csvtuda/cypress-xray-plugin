import { XrayClientCloud, XrayClientServer } from "@qytera/xray-client";
import type { CloudClient, ServerClient } from "jira.js";
import { createCloudClient, createServerClient } from "jira.js";

import "dotenv/config";

export const XRAY_CLIENT_CLOUD = new XrayClientCloud({
    credentials: {
        clientId: getEnv("CYPRESS_XRAY_CLIENT_ID_CLOUD", "XRAY_CLIENT_ID"),
        clientSecret: getEnv("CYPRESS_XRAY_CLIENT_SECRET_CLOUD", "XRAY_CLIENT_SECRET"),
        path: "/api/v2/authenticate",
    },
    url: "https://xray.cloud.getxray.app",
});

export const XRAY_CLIENT_SERVER = new XrayClientServer({
    credentials: {
        token: getEnv("CYPRESS_JIRA_API_TOKEN_SERVER"),
    },
    url: getEnv("CYPRESS_JIRA_URL_SERVER"),
});

export interface JiraClientCloud extends CloudClient {
    kind: "cloud";
}

export interface JiraClientServer extends ServerClient {
    kind: "server";
}

export const JIRA_CLIENT_CLOUD: JiraClientCloud = {
    ...createCloudClient({
        auth: {
            apiToken: getEnv("CYPRESS_JIRA_API_TOKEN_CLOUD"),
            email: getEnv("CYPRESS_JIRA_USERNAME_CLOUD"),
            type: "basic",
        },
        host: getEnv("CYPRESS_JIRA_URL_CLOUD"),
    }),
    kind: "cloud",
};

export const JIRA_CLIENT_SERVER: JiraClientServer = {
    ...createServerClient({
        auth: {
            token: getEnv("CYPRESS_JIRA_API_TOKEN_SERVER"),
            type: "bearer",
        },
        host: getEnv("CYPRESS_JIRA_URL_SERVER"),
    }),
    kind: "server",
};

export function getIntegrationClient<T extends "cloud" | "server">(
    client: "xray",
    service: T
): T extends "cloud" ? XrayClientCloud : XrayClientServer;
export function getIntegrationClient<T extends "cloud" | "server">(
    client: "jira",
    service: T
): T extends "cloud" ? JiraClientCloud : JiraClientServer;
export function getIntegrationClient(client: "jira" | "xray", service: "cloud" | "server") {
    switch (client) {
        case "jira": {
            switch (service) {
                case "cloud":
                    return JIRA_CLIENT_CLOUD;
                case "server":
                    return JIRA_CLIENT_SERVER;
                default:
                    throw new Error("Unknown service type");
            }
        }
        case "xray": {
            switch (service) {
                case "cloud":
                    return XRAY_CLIENT_CLOUD;
                case "server":
                    return XRAY_CLIENT_SERVER;
                default:
                    throw new Error("Unknown service type");
            }
        }
        default:
            throw new Error("Unknown client type");
    }
}

function getEnv(...keys: string[]): string {
    let value: string | undefined;
    for (const key of keys) {
        if (!process.env[key]) {
            continue;
        }
        value = process.env[key];
    }
    if (!value) {
        throw new Error(
            `Failed to find environment variable value for keys: ${JSON.stringify(keys)}`
        );
    }
    return value;
}
