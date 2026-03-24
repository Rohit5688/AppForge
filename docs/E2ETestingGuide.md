# 🧪 AppForge — End-to-End Testing Guide

This guide walks you through testing every feature of AppForge as an end user.

> **Note:** Some tests require Appium 2.x, Android Studio/Xcode, and a running emulator/simulator. Tests marked with 📱 require a live device. Others work offline.

---

## Prerequisites

1. **Build the server**: `npm run build`
2. **Add to your MCP client config**:
```json
{
  "mcpServers": {
    "appforge": {
      "command": "node",
      "args": ["/absolute/path/to/AppForge/dist/index.js", "--transport", "stdio"]
    }
  }
}
```
3. **Restart your IDE** to pick up the new server.

---

## Test 1: Project Setup (`setup_project`)

**Prompt:**
> "Set up a new mobile automation project at `/path/to/mobile-project` for Android"

**Expected:** Creates WebdriverIO + Cucumber project with `BasePage.ts`, `MobileGestures.ts`, hooks, and sample feature.

## Test 2: Environment Check (`check_environment`)

**Prompt:**
> "Check if my environment is ready for Android testing"

**Expected:** Verifies Appium server, Android SDK, emulator status, app binary.

## Test 3: Configuration (`manage_config`)

**Prompt:**
> "Show me the mobile project configuration"

**Expected:** Displays capabilities, device routing, cloud settings.

## Test 4: App Build Injection (`inject_app_build`)

**Prompt:**
> "Set the Android app path to `/path/to/app.apk`"

**Expected:** Updates the platform's app path in `mcp-config.json`.

## Test 5: Codebase Analysis (`analyze_codebase`)

**Prompt:**
> "Analyze the mobile project codebase"

**Expected:** Returns AST-extracted steps, page methods, and helpers.

## Test 6: Test Generation (`generate_cucumber_pom`)

**Prompt:**
> "Generate a BDD test for a login screen with username, password fields and a LOGIN button"

**Expected:** Generates `.feature` file, step definitions, and platform-specific Page Objects.

## Test 7: Validate & Write (`validate_and_write`)

**Prompt:**
> "Write and validate the generated files"

**Expected:** TypeScript validation (`tsc --noEmit`), Gherkin syntax check, files written to disk.

## Test 8: Dry Run (`validate_and_write` with `dryRun: true`)

**Prompt:**
> "Do a dry run of the generated files"

**Expected:** Validates without writing. Shows proposed files and audit warnings.

## Test 9: Run Tests (`run_cucumber_test`)

**Prompt:**
> "Run the Cucumber tests with @smoke tag on Android"

**Expected:** Executes Cucumber Appium tests with tag/platform filtering.

## Test 10: 📱 Live Session (`start_appium_session`)

**Prompt:**
> "Start an Appium session on Android"

**Expected:** Returns session ID, device info, initial page source, screenshot.

## Test 11: 📱 UI Inspection (`inspect_ui_hierarchy`)

**Prompt:**
> "Inspect the current screen's UI hierarchy"

**Expected:** Parses XML page source and returns structured element tree.

## Test 12: 📱 Selector Verification (`verify_selector`)

**Prompt:**
> "Verify if the selector `~loginButton` exists on the current screen"

**Expected:** Returns visibility, enabled state, and element bounds.

## Test 13: Self-Healing (`self_heal_test`)

**Prompt (after failure):**
> "Analyze this test failure and suggest fixes: [paste error + XML hierarchy]"

**Expected:** Classifies failure and suggests healed selectors (prioritizes accessibility-id).

## Test 14: 📱 End Session (`end_appium_session`)

**Prompt:**
> "End the Appium session"

**Expected:** Session terminated, device released.

## Test 15: Credentials (`set_credentials`)

**Prompt:**
> "Set my BrowserStack credentials for cloud testing"

**Expected:** Updates `.env` with cloud authentication keys.

## Test 16: User Management (`manage_users`)

**Prompt:**
> "List test users for the staging environment"

**Expected:** Shows users with roles and credential status.

## Test 17: Locator Audit (`audit_mobile_locators`)

**Prompt:**
> "Audit the mobile locators for brittle XPaths"

**Expected:** Markdown report flagging fragile selectors.

## Test 18: Suite Summary (`summarize_suite`)

**Prompt:**
> "Summarize the test execution results"

**Expected:** Plain English summary of Cucumber JSON report.

## Test 19: Migration (`migrate_test`)

**Prompt:**
> "Migrate this Espresso LoginTest.java to Appium + Cucumber: [paste code]"

**Expected:** Returns migration prompt converting native tests to BDD.

## Test 20: Coverage Analysis (`analyze_coverage`)

**Prompt:**
> "Analyze test coverage and identify missing scenarios"

**Expected:** Heatmap metrics, missing screens, negative scenario suggestions.

## Test 21: Refactoring (`suggest_refactorings`)

**Prompt:**
> "Find duplicate steps and unused Page Object methods"

**Expected:** Structured cleanup report.

## Test 22: CI Workflow (`generate_ci_workflow`)

**Prompt:**
> "Generate a GitHub Actions workflow for Android Appium tests"

**Expected:** Creates `.github/workflows/appium.yml`.

## Test 23: Bug Report (`export_bug_report`)

**Prompt:**
> "Generate a Jira bug report for this failed mobile test: [paste error]"

**Expected:** Jira-formatted report with auto-classified severity.

## Test 24: Test Data Factory (`generate_test_data_factory`)

**Prompt:**
> "Generate a typed faker.js factory for a User entity with name, email, and phone"

**Expected:** Returns TypeScript interface + faker.js builder function.

## Test 25: Team Knowledge (`train_on_example` + `export_team_knowledge`)

**Prompt 1:**
> "Learn: For Samsung devices, use `UiSelector().resourceId()` instead of `accessibility-id`"

**Prompt 2:**
> "Export the team knowledge to Markdown"

**Expected:** Rule saved and exported as Markdown.

## Test 26: 🆕 Token Optimizer (`execute_sandbox_code`)

**Prompt:**
> "Using the sandbox, analyze the mobile project and tell me how many step definitions exist"

**Expected:** Returns just the count instead of full analysis JSON. See [Token Optimizer](TokenOptimizer.md).

---

## Quick Verification Checklist

| # | Feature | Tool Name | Status |
|---|---------|-----------|--------|
| 1 | Project Setup | `setup_project` | ☐ |
| 2 | Environment Check | `check_environment` | ☐ |
| 3 | Configuration | `manage_config` | ☐ |
| 4 | App Build | `inject_app_build` | ☐ |
| 5 | Codebase Analysis | `analyze_codebase` | ☐ |
| 6 | Test Generation | `generate_cucumber_pom` | ☐ |
| 7 | Validate & Write | `validate_and_write` | ☐ |
| 8 | Run Tests | `run_cucumber_test` | ☐ |
| 9 | 📱 Live Session | `start_appium_session` | ☐ |
| 10 | 📱 UI Inspection | `inspect_ui_hierarchy` | ☐ |
| 11 | 📱 Selector Verify | `verify_selector` | ☐ |
| 12 | Self-Healing | `self_heal_test` | ☐ |
| 13 | Credentials | `set_credentials` | ☐ |
| 14 | User Management | `manage_users` | ☐ |
| 15 | Locator Audit | `audit_mobile_locators` | ☐ |
| 16 | Suite Summary | `summarize_suite` | ☐ |
| 17 | Migration | `migrate_test` | ☐ |
| 18 | Coverage | `analyze_coverage` | ☐ |
| 19 | Refactoring | `suggest_refactorings` | ☐ |
| 20 | CI Workflow | `generate_ci_workflow` | ☐ |
| 21 | Bug Report | `export_bug_report` | ☐ |
| 22 | Test Data | `generate_test_data_factory` | ☐ |
| 23 | Team Learning | `train_on_example` | ☐ |
| 24 | Token Optimizer | `execute_sandbox_code` | ☐ |
