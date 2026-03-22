# ⚙️ Appium-Cucumber POM MCP Configuration Guide

The `mcp-config.json` file dictates project-level rules for test generation, execution, and mobile device capabilities. The AI reads this file to understand the environment parameters it must operate under.

---

## 🏗️ Configuration Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `$schema` | `string` | Link to the local `.appium-mcp/configSchema.json` for IDE autocompletion. |
| `version` | `string` | Configuration schema version (e.g., `"1.1.0"`). Used for auto-migrations. |
| `project.language` | `enum` | Always `"typescript"`. |
| `project.client` | `enum` | Always `"webdriverio-appium"`. |
| `mobile.defaultPlatform` | `enum` | `"Android"`, `"iOS"`, or `"both"`. |
| `mobile.capabilitiesProfiles` | `Record` | Named sets of Appium capabilities (e.g., `"pixel8"`, `"iphone14"`). |
| `paths.featuresRoot` | `string` | Location of `.feature` files (default: `"features"`). |
| `paths.pagesRoot` | `string` | Location of Page Objects (default: `"pages"`). |
| `paths.stepsRoot` | `string` | Location of Step Definitions (default: `"step-definitions"`). |
| `paths.utilsRoot` | `string` | Location of helper utilities (default: `"utils"`). |
| `reuse.locatorOrder` | `string[]` | Priority list for selector generation (e.g., `["accessibility id", "resource-id", "xpath"]`). |

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

## 🛠️ Customizing Locators

Use the `reuse.locatorOrder` array to tell the AI what you prefer. If your app has excellent Accessibility support, prioritize `accessibility id`. If you are testing a legacy Android app with only IDs, put `resource-id` first.

```json
"reuse": {
  "locatorOrder": ["accessibility id", "resource-id", "text", "xpath"]
}
```

This ensures the `generate_cucumber_pom` and `self_heal_test` tools always try to give you the most stable selector first!
