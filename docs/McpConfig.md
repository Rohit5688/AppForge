# ⚙️ AppForge Configuration Guide

The `mcp-config.json` file dictates project-level rules for test generation, execution, and mobile device capabilities. The AI reads this file to understand the environment parameters it must operate under.

---

## 🏗️ Configuration Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `$schema` | `string` | Link to the local `.AppForge/configSchema.json` for IDE autocompletion. |
| `version` | `string` | Configuration schema version (e.g., `"1.1.0"`). Used for auto-migrations. |
| `project.language` | `enum` | Always `"typescript"`. |
| `project.client` | `enum` | Always `"webdriverio-appium"`. |
| `mobile.defaultPlatform` | `enum` | `"Android"`, `"iOS"`, or `"both"`. |
| `mobile.capabilitiesProfiles` | `Record` | Named sets of Appium capabilities (e.g., `"pixel8"`, `"iphone14"`). |
| `paths.featuresRoot` | `string` | Location of `.feature` files (default: `"features"`). |
| `paths.pagesRoot` | `string` | Location of Page Objects (default: `"pages"`). |
| `paths.stepsRoot` | `string` | Location of Step Definitions (default: `"step-definitions"`). |
| `paths.utilsRoot` | `string` | Location of helper utilities (default: `"utils"`). |
| `paths.testDataRoot` | `string` | Location of test data files (default: `"src/test-data"`). |
| `reuse.locatorOrder` | `string[]` | Priority list for selector generation (e.g., `["accessibility id", "resource-id", "xpath"]`). |
| `execution.timeoutMs` | `number` | Default timeout for test execution in milliseconds (default: `1800000` = 30 min). |
| `project.executionCommand` | `string` | Command to execute tests (e.g., `"npx wdio run wdio.conf.ts"`). |

---

## 📱 Mobile Profiles: The `capabilitiesProfiles` Object

This is where you define your target devices. Use `manage_config` or edit manually:

```json
"mobile": {
  "defaultPlatform": "Android",
  "capabilitiesProfiles": {
    "pixel_8_local": {
      "platformName": "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": "emulator-5554",
      "appium:app": "./apps/demo.apk"
    },
    "bs_iphone_15": {
      "platformName": "iOS",
      "appium:automationName": "XCUITest",
      "appium:deviceName": "iPhone 15",
      "browserstack.user": "${BS_USER}",
      "appium:app": "bs://app-id-here"
    }
  }
}
```

> [!TIP]
> **Environment Variables**: You can use `${VAR_NAME}` syntax inside your profiles. The MCP server will automatically resolve these from your `.env` file!

---

## 🧱 Multi-Config Architecture (WebdriverIO)

For dual-platform projects (testing both `Android` and `iOS`), the Appium MCP supports a **Multi-Config** setup. When initializing a project with `platform: "both"`, it scaffolds three separate WebdriverIO configurations:

1. `wdio.shared.conf.ts` (Core Cucumber settings, reporting, and Appium connection limits)
2. `wdio.android.conf.ts` (Imports shared config + Android UiAutomator2 capabilities)
3. `wdio.ios.conf.ts` (Imports shared config + iOS XCUITest capabilities)

When executing tests via `run_cucumber_test` (e.g., asking the AI to "Run Android tests"), the MCP Server will automatically route execution to `npx wdio run wdio.android.conf.ts`. If you are using a legacy monolithic `wdio.conf.ts`, the agent will still execute it but inject `platformName` capability overrides at runtime.

---

## 🛠️ Customizing Locators

Use the `reuse.locatorOrder` array to tell the AI what you prefer. If your app has excellent Accessibility support, prioritize `accessibility id`. If you are testing a legacy Android app with only IDs, put `resource-id` first.

```json
"reuse": {
  "locatorOrder": ["accessibility id", "resource-id", "text", "xpath"]
}
```

This ensures the `generate_cucumber_pom` and `self_heal_test` tools always try to give you the most stable selector first!

---

## ⏱️ Test Execution Timeout

The `execution.timeoutMs` field controls how long tests are allowed to run before being terminated. This is especially important for long-running test suites or CI environments.

```json
"execution": {
  "timeoutMs": 3600000
}
```

### Timeout Resolution Priority

When `run_cucumber_test` executes, it resolves the timeout in this order:

1. **Explicit parameter** - `timeoutMs` passed directly to the tool call (highest priority)
2. **mcp-config.json** - The `execution.timeoutMs` value
3. **Auto-detected** - Parsed from `playwright.config.ts` or `playwright.config.js` (if present)
4. **Default** - 30 minutes (1800000ms) if nothing else is configured

### Example Configurations

**Short smoke tests (5 minutes):**
```json
"execution": {
  "timeoutMs": 300000
}
```

**Full regression suite (2 hours):**
```json
"execution": {
  "timeoutMs": 7200000
}
```

> [!WARNING]
> **Maximum Timeout**: The system enforces a 2-hour (7200000ms) cap for safety. Requests exceeding this will be automatically capped with a warning.

### Direct Tool Usage

You can also override the timeout when calling `run_cucumber_test` directly:

```javascript
// AI Host call example:
use_mcp_tool({
  server_name: "appForge",
  tool_name: "run_cucumber_test",
  arguments: {
    projectRoot: "/path/to/project",
    timeoutMs: 600000,  // 10 minutes for this specific run
    tags: "@smoke"
  }
})
```

The tool output will always show which timeout was used:
```
[Timeout: 600000ms (source: explicit)]

Test execution output...
```
