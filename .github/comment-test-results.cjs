// @ts-check

const fs = require("node:fs");
const path = require("node:path");

const WATERMARK = "<!-- ## -- COMMENT FOR TEST RESULTS -- ## -->";
const UPDATE_REMARK = "<sub>This comment has been updated with the latest test results.</sub>";

/**
 * @typedef {Object} TestResult
 * @property {string} file
 * @property {string[]} name
 * @property {number} milliseconds
 * @property {"passed" | "failed"} status
 */

/**
 * GitHub Action entrypoint that reads test results from JSON files and posts (or updates) a
 * formatted PR comment.
 *
 * @param {import('@actions/github-script').AsyncFunctionArguments} params
 * @param {string} header
 * @param {string[]} resultFilePaths
 * @param {boolean} listPassedTests
 */
module.exports = async ({ github, context }, header, resultFilePaths, listPassedTests) => {
    const results = resultFilePaths
        .flatMap(collectJsonFiles)
        .flatMap(parseJsonFiles)
        .sort((a, b) => (a.file + a.name).localeCompare(b.file + b.name));
    const passedTests = results.filter((t) => t.status === "passed");
    const failedTests = results.filter((t) => t.status === "failed");
    const section = [`## ${header}`, "", `🧪 **Total**: ${results.length}`];
    if (failedTests.length > 0) {
        section.push("", renderFailedTable(failedTests));
    }
    if (listPassedTests) {
        if (passedTests.length > 0) {
            section.push("", renderPassedTable(passedTests));
        }
    } else {
        section.push("", `✅ **Passed**: ${passedTests.length}`);
    }
    await postOrUpdateComment(github, context, header, section.join("\n"), WATERMARK);
};

/**
 * Collects JSON report files from the provided path.
 *
 * @param {string} inputPath
 * @returns {string[]}
 */
function collectJsonFiles(inputPath) {
    const stat = fs.statSync(inputPath);
    if (stat.isDirectory()) {
        const entries = fs.readdirSync(inputPath, { withFileTypes: true });
        return entries.flatMap((entry) => collectJsonFiles(path.join(inputPath, entry.name)));
    }
    if (inputPath.endsWith(".json")) {
        return [inputPath];
    }
    return [];
}

/**
 * Parse test results from the provided file.
 *
 * @param {string} file
 * @returns {TestResult[]}
 */
function parseJsonFiles(file) {
    /** @type {TestResult[]} */
    const result = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`Parsed ${result.length} test results from: ${file}`);
    return result;
}

/**
 * Renders passed tests table (collapsed).
 *
 * @param {TestResult[]} passedTests
 * @returns {string}
 */
function renderPassedTable(passedTests) {
    return [
        "<details>",
        `<summary>✅ Passed Tests (${passedTests.length})</summary>`,
        "",
        renderTable(passedTests),
        "",
        "</details>",
    ].join("\n");
}

/**
 * Renders failed tests table (expanded).
 *
 * @param {TestResult[]} failedTests
 * @returns {string}
 */
function renderFailedTable(failedTests) {
    return [
        "<details open>",
        `<summary>❌ Failed Tests (${failedTests.length})</summary>`,
        "",
        renderTable(failedTests),
        "",
        "</details>",
    ].join("\n");
}

/**
 * Posts or updates a GitHub PR comment.
 *
 * @param {import('@actions/github-script').AsyncFunctionArguments["github"]} github
 * @param {import('@actions/github-script').AsyncFunctionArguments["context"]} context
 * @param {string} sectionTitle
 * @param {string} sectionBody
 * @param {string} watermark
 */
async function postOrUpdateComment(github, context, sectionTitle, sectionBody, watermark) {
    const { owner, repo } = context.repo;
    const issue_number = context.issue.number;
    const comments = await github.rest.issues.listComments({
        owner,
        repo,
        issue_number,
    });
    const comment = comments.data.find((c) => c.body?.includes(watermark));
    const sectionStart = `<!-- BEGIN SECTION: ${sectionTitle} -->`;
    const sectionEnd = `<!-- END SECTION: ${sectionTitle} -->`;
    const section = `${sectionStart}\n${sectionBody}\n${sectionEnd}`;
    if (!comment) {
        const body = `${watermark}\n${section}`;
        await github.rest.issues.createComment({
            owner,
            repo,
            issue_number,
            body,
        });
        return;
    }
    let body = comment.body ?? "";
    const startIndex = body.indexOf(sectionStart);
    const endIndex =
        startIndex >= 0 ? body.indexOf(sectionEnd, startIndex + sectionStart.length) : -1;
    if (startIndex >= 0 && endIndex >= 0) {
        body = `${body.slice(0, startIndex)}${section}${body.slice(endIndex + sectionEnd.length)}`;
    } else {
        body = `${body}\n${section}`;
    }
    if (!body.includes(UPDATE_REMARK)) {
        body = `${body}\n${UPDATE_REMARK}`;
    }
    await github.rest.issues.updateComment({
        owner,
        repo,
        comment_id: comment.id,
        body,
    });
}

/**
 * Renders a markdown table from test results.
 *
 * @param {TestResult[]} tests
 * @returns {string}
 */
function renderTable(tests) {
    const header = ["| Status | Test | Time |", "|--------|------|------|"].join("\n");
    return [header, ...tests.map(formatRow)].join("\n");
}

/**
 * Maps test status to emoji representation.
 *
 * @param {"passed" | "failed"} status
 */
function formatStatus(status) {
    return status === "passed" ? "✅" : "❌";
}

/**
 * Turns a test result into a table row.
 *
 * @param {TestResult} testResult
 */
function formatRow(testResult) {
    const time = `${testResult.milliseconds.toFixed(2)}ms`;
    const file = testResult.name[0];
    const subparts = testResult.name.slice(1).map((s) => `\`:: ${s}\``);
    const name = [file, ...subparts].join("<br/>");
    return `| ${formatStatus(testResult.status)} | ${name} | ${time} |`;
}
