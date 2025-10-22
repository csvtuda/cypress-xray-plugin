const { defineConfig } = require("cypress");
const fix = require("cypress-on-fix");
const { configureXrayPlugin } = require("@csvtuda/cypress-xray-plugin");

module.exports = defineConfig({
    chromeWebSecurity: false,
    e2e: {
        async setupNodeEvents(on, config) {
            const fixedOn = fix(on);
            await configureXrayPlugin(fixedOn, config, {
                jira: {
                    projectKey: "CXP",
                    testExecutionIssue: {
                        fields: {
                            summary: "Integration test evidence attachments using tasks",
                        },
                    },
                    url: "https://example.org",
                },
            });
            return config;
        },
        specPattern: "**/*.cy.js",
    },
});
