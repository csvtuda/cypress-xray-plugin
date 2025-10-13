import type { Logger } from "../src/util/logging";
import { unknownToString } from "../src/util/string";

export function getMockedCypress(): {
    cy: Cypress.cy & CyEventEmitter;
    cypress: Cypress.Cypress & CyEventEmitter;
} {
    global.Cypress = {
        ["Commands"]: {},
        currentTest: {},
    } as Cypress.Cypress & CyEventEmitter;
    global.cy = {
        task: () => {
            throw new Error("Mock called unexpectedly");
        },
    } as unknown as Cypress.cy & CyEventEmitter;
    return { cy: global.cy, cypress: global.Cypress };
}

export function getMockedLogger(functions?: Partial<Logger>): Logger {
    return {
        configure:
            functions?.configure ??
            ((...args: unknown[]) => {
                throw new Error(
                    `Logging function configure called unexpectedly with args: ${unknownToString(args)}`
                );
            }),
        logErrorToFile:
            functions?.logErrorToFile ??
            ((...args: unknown[]) => {
                throw new Error(
                    `Logging function logErrorToFile called unexpectedly with args: ${unknownToString(args)}`
                );
            }),
        logToFile:
            functions?.logToFile ??
            ((...args: unknown[]) => {
                throw new Error(
                    `Logging function logToFile called unexpectedly with args: ${unknownToString(args)}`
                );
            }),
        message:
            functions?.message ??
            ((...args: unknown[]) => {
                throw new Error(
                    `Logging function message called unexpectedly with args: ${unknownToString(args)}`
                );
            }),
    };
}
