import { resolve } from "node:path";
import type { TestShard } from "node:test";
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { startServer, stopServer } from "./server";
import { findFiles } from "./util";

const INTEGRATION_DIR = resolve("test", "integration");

const TEST_STREAM = run({
    files: findFiles(INTEGRATION_DIR, (filepath: string) => filepath.endsWith(".spec.mts")),
    only: Boolean(process.env.ONLY ?? false),
    shard: getShard(),
})
    .once("test:fail", () => {
        process.exitCode = 1;
    })
    .once("readable", () => {
        startServer();
    })
    .once("end", () => {
        stopServer();
    });

TEST_STREAM.pipe(spec()).pipe(process.stdout);

function getShard(): TestShard {
    const index = Number.parseInt(process.env.INTEGRATION_TESTS_SHARD_INDEX ?? "1", 10);
    const total = Number.parseInt(process.env.INTEGRATION_TESTS_SHARD_TOTAL ?? "1", 10);
    return { index, total };
}
