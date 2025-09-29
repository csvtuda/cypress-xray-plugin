import type { StringMap } from "../types/util";
import { unknownToString } from "./string";

/**
 * Extracts a string property from an object.
 *
 * @param data - the object
 * @param propertyName - the property to access
 * @returns the property's string value
 * @throws if `data` is not an object or does not contain a string property `propertyName`
 */
export function extractString(data: unknown, propertyName: string): string {
    verifyIsObjectWithProperty(data, propertyName);
    const value = data[propertyName];
    if (typeof value !== "string") {
        throw new Error(`Value is not of type string: ${unknownToString(value)}`);
    }
    return value;
}

/**
 * Extracts a string array property from an object.
 *
 * @param data - the object
 * @param propertyName - the property to access
 * @returns the property's string array value
 * @throws if `data` is not an object or does not contain a string array property `propertyName`
 */
export function extractArrayOfStrings(data: unknown, propertyName: string): string[] {
    verifyIsObjectWithProperty(data, propertyName);
    const value = data[propertyName];
    if (!Array.isArray(value) || value.some((element) => typeof element !== "string")) {
        throw new Error(`Value is not an array of type string: ${JSON.stringify(value)}`);
    }
    return value as string[];
}

function verifyIsObjectWithProperty(
    data: unknown,
    propertyName: string
): asserts data is StringMap<unknown> {
    if (typeof data !== "object" || data === null || !(propertyName in data)) {
        throw new Error(
            `Expected an object containing property '${propertyName}', but got: ${JSON.stringify(
                data
            )}`
        );
    }
}
