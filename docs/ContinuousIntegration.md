# 🛠️ Continuous Integration & Bug Reporting

Moving your mobile automation code from your local machine to production requires pipelines and reporting. The Appium-Cucumber MCP natively scaffolds these flows.

---

## 🏗️ `generate_ci_workflow`
Instantly writes a complete, highly-optimized YAML file for the CI/CD provider of your choice. Pre-configured with Node.js setup, Appium server installation, dependency installation, and execution commands.

*   **Supported Providers**: GitHub Actions, GitLab CI.
*   **Key Feature**: Automated Appium server start and Emulator/Simulator boot configuration.

**Example Prompt to AI:**
> *"Generate a CI workflow for GitHub Actions. It should run my Android tests on every Push to `main` using BrowserStack."*

---

## 🐛 `export_bug_report`
When a test fails, you can ask the AI to generate a Markdown-formatted bug report (ideal for Jira or Linear). 

**The report includes:**
*   **Context**: App version and device profile.
*   **Error Detail**: The exact WebdriverIO stack trace and Appium error codes.
*   **Visual Evidence**: Paths to the failing screenshot and the Appium session logs.
*   **Steps to Reproduce**: The Gherkin scenario that failed.

**Example Prompt to AI:**
> *"The 'Sign Up' scenario just failed with a timeout. Generate a Jira bug report for me so I can open a ticket for the developers."*

---

## 📈 `analyze_coverage`
This tool parses your feature files to find exactly which application screens or flows are missing tests. It compares your existing BDD footprint against a standard mobile test matrix (including Negative and Accessibility paths).

**Example Prompt to AI:**
> *"Run the coverage analysis on my project. Tell me which screens are untested and draft the Gherkin scenarios for them."*

---

## 🧪 Integration with Cloud Grids (BrowserStack / SauceLabs)
The MCP is designed to work seamlessly with cloud grids. Simply provide your `username` and `accessKey` via `set_credentials`, and use the `manage_config` tool to update your `capabilitiesProfiles` to point to the cloud provider's URL.

**Example Prompt to AI:**
> *"I want to run my tests on BrowserStack. Add a new 'bs_pixel8' profile to my config and set it up with my credentials from the .env file."*
