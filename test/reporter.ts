import type { TestEvent } from "node:test/reporters";

interface TestResult {
    file: string;
    milliseconds: number;
    name: string[];
    status: "failed" | "passed";
}

interface TestNode {
    children: TestNode[];
    name: string;
    parent?: TestNode;
}

const ROOT_NODE_NAME = "__root__";

export async function* jsonReporter(source: AsyncIterable<TestEvent>) {
    const results: TestResult[] = [];
    const root: TestNode = {
        children: [],
        name: ROOT_NODE_NAME,
    };
    const testNodeStack: TestNode[] = [root];

    for await (const event of source) {
        switch (event.type) {
            case "test:start": {
                const parentNode = testNodeStack[testNodeStack.length - 1];
                const currentNode: TestNode = {
                    children: [],
                    name: event.data.name,
                    parent: parentNode,
                };
                testNodeStack.push(currentNode);
                parentNode.children.push(currentNode);
                break;
            }
            case "test:pass":
            case "test:fail": {
                const currentNode = testNodeStack.pop();
                if (!currentNode) {
                    throw new Error(`Encountered detached test: ${event.data.name}`);
                }
                // A leaf is a test case.
                if (currentNode.children.length === 0) {
                    results.push({
                        file: event.data.file ?? "",
                        milliseconds: event.data.details.duration_ms,
                        name: getFullPath(currentNode),
                        status: event.type === "test:pass" ? "passed" : "failed",
                    });
                }
                break;
            }
        }
    }

    yield JSON.stringify(results, null, 2);
}

function getFullPath(node: TestNode): string[] {
    const parts: string[] = [];
    let cur: TestNode | undefined = node;
    while (cur && cur.name !== ROOT_NODE_NAME) {
        parts.unshift(cur.name);
        cur = cur.parent;
    }
    return parts;
}
