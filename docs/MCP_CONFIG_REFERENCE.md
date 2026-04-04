# MCP Config Reference — `mcp-config.json`

This document is the authoritative reference for every field in `mcp-config.json`.
It is generated alongside your project by `setup_project` and displayed by `manage_config`.

Fields marked **[REQUIRED]** must be set before any tool will work.  
Fields marked **[RECOMMENDED]** unlock specific tool features. You can add them later via `manage_config` + `upgrade_project`.  
Fields marked **[OPTIONAL]** have sensible defaults — change only if you need to override.

---

## How to Update Config

```bash
# Read current config
manage_config → operation="read"

# Update specific fields (deep merge — other fields preserved)
manage_config → operation="write", config={ "currentEnvironment": "local" }

# Apply new scaffolding after config changes
upgrade_project
```

> **`upgrade_project` is idempotent.** Run it any time after updating config.
> It only creates what's missing — never overwrites existing custom code.

---

## Full Config Structure

```json
{
  "$schema": "./.AppForge/configSchema.json",
  "version": "1.1.0",

  "project": { ... },        // REQUIRED
  "mobile": { ... },         // REQUIRED
  "paths": { ... },          // RECOMMENDED
  "environments": [...],     // RECOMMENDED
  "currentEnvironment": ".", // RECOMMENDED
  "credentials": { ... },    // RECOMMENDED (set via manage_users)
  "codegen": { ... },        // RECOMMENDED
  "reuse": { ... },          // RECOMMENDED
  "builds": { ... },         // OPTIONAL
  "activeBuild": ".",        // OPTIONAL
  "timeouts": { ... },       // OPTIONAL
  "selfHeal": { ... },       // OPTIONAL
  "reporting": { ... }       // OPTIONAL
}
```

---

## Section: `project` [REQUIRED]

```json
"project": {
  "language": "typescript",
  "testFramework": "cucumber",
  "client": "webdriverio-appium",
  "executionCommand": "npx wdio run wdio.conf.ts"
}
```

| Field | Values | Used By | Why |
|-------|--------|---------|-----|
| `language` | `"typescript"` | All tools | Determines file extension, import style, tsconfig |
| `testFramework` | `"cucumber"` | `generate_cucumber_pom`, `run_cucumber_test` | Controls feature file format and step definition style |
| `client` | `"webdriverio-appium"` | `setup_project`, `run_cucumber_test` | Determines wdio config template and dependency list |
| `executionCommand` | Any shell command | `run_cucumber_test` | Overrides default `npx wdio run wdio.conf.ts`. Set if you have a custom npm script. |

**When to set `executionCommand`**: When your project has a custom test script, e.g. `npm run test:android`.

---

## Section: `mobile` [REQUIRED]

```json
"mobile": {
  "defaultPlatform": "android",
  "capabilitiesProfiles": {
    "pixel8": {
      "platformName": "Android",
      "appium:automationName": "UiAutomator2",
      "appium:deviceName": "Pixel_8",
      "appium:app": "/path/to/app.apk",
      "appium:newCommandTimeout": 240,
      "appium:noReset": false
    },
    "iphone14": {
      "platformName": "iOS",
      "appium:automationName": "XCUITest",
      "appium:deviceName": "iPhone 14",
      "appium:app": "/path/to/app.app"
    }
  },
  "cloud": {
    "provider": "browserstack",
    "username": "${BS_USERNAME}",
    "accessKey": "${BS_ACCESS_KEY}"
  }
}
```

| Field | Used By | Why |
|-------|---------|-----|
| `defaultPlatform` | `start_appium_session`, `generate_cucumber_pom` | Used when no profile name is specified. Tells LLM which platform to target. |
| `capabilitiesProfiles` | `start_appium_session`, `inject_app_build` | Named profiles allow switching between devices without changing code. |
| `cloud.provider` | `start_appium_session`, `generate_ci_workflow` | Switches between local Appium and BrowserStack/SauceLabs. Use `"none"` for local. |
| `cloud.username/accessKey` | `start_appium_session` | Use `${ENV_VAR}` syntax — resolved from `.env` at session start. Never hardcode. |

**Capability profile tips**:
- `appium:app` — Set after your first build via `inject_app_build` tool.
- Multiple profiles = multiple devices. Name them by device model for clarity.
- `appium:noReset: false` — App reinstalled on each run. Use `true` for faster local iteration.

---

## Section: `paths` [RECOMMENDED]

```json
"paths": {
  "featuresRoot": "features",
  "pagesRoot": "pages",
  "stepsRoot": "step-definitions",
  "utilsRoot": "utils",
  "testDataRoot": "src/test-data"
}
```

| Field | Default | Used By | Why |
|-------|---------|---------|-----|
| `featuresRoot` | `"features"` | `generate_cucumber_pom`, `summarize_suite` | Where `.feature` files live |
| `pagesRoot` | `"pages"` | `generate_cucumber_pom`, `analyze_codebase` | Where Page Object `.ts` files live |
| `stepsRoot` | `"step-definitions"` | `generate_cucumber_pom`, `analyze_codebase` | Where step definition `.ts` files live |
| `utilsRoot` | `"utils"` | `manage_users`, `audit_utils` | Where utility files (`ActionUtils.ts`, `getCredentials.ts`) live |
| `testDataRoot` | `"src/test-data"` | `manage_users` | Root of test data directory |

**When to configure**: Always set these if your project doesn't use the defaults.
Wrong paths = generated imports fail silently.

---

## Section: `environments` + `currentEnvironment` [RECOMMENDED]

```json
"environments": ["local", "staging", "uat", "prod"],
"currentEnvironment": "staging"
```

| Field | Used By | Why |
|-------|---------|-----|
| `environments` | `manage_users`, `manage_config` (write validation), `generate_cucumber_pom` | Defines valid env names. `manage_config` rejects `currentEnvironment` values not in this list. |
| `currentEnvironment` | `manage_users`, `generate_cucumber_pom`, `set_credentials` | Active env for test runs. All env-specific file operations (`users.{env}.json`, `.env.{env}`) use this value as default. |

**How to switch environments**:
```
manage_config → operation="write", config={ "currentEnvironment": "local" }
```
After switching, `manage_users read` returns credentials for the new environment.

**When to set**: Early in project setup. Saves you from having to pass `env` to every tool call.

---

## Section: `credentials` [RECOMMENDED — set via manage_users]

```json
"credentials": {
  "strategy": "role-env-matrix",
  "file": "credentials/users.json",
  "schemaHint": ""
}
```

| Field | Values | Why |
|-------|--------|-----|
| `strategy` | `"role-env-matrix"` \| `"per-env-files"` \| `"unified-key"` \| `"custom"` | Determines how `manage_users` creates/reads credential files and how `generate_cucumber_pom` generates the `getCredentials()` reader |
| `file` | Relative path | Where the credential JSON lives. Default depends on strategy. Always gitignored. |
| `schemaHint` | Plain English | Only for `"custom"` strategy. Describes your JSON format so the LLM can generate the correct reader. |

**Strategy comparison**:

| Strategy | File | Best For |
|---|---|---|
| `role-env-matrix` | `credentials/users.json` | Most teams — one file, access by role+env |
| `per-env-files` | `credentials/users.{env}.json` | Large teams with strict env separation |
| `unified-key` | `credentials/users.json` | Small projects — key = `"{role}-{env}"` |
| `custom` | You define | Teams with existing credential systems |

> **`.env` files are NOT for passwords.** They are for non-secret config (URLs, ports, flags).
> Passwords go in `credentials/` which is always added to `.gitignore`.

---

## Section: `codegen` [RECOMMENDED]

Controls how `generate_cucumber_pom` generates test code.

```json
"codegen": {
  "customWrapperPackage": null,
  "basePageStrategy": "extend",
  "namingConvention": {
    "pageObjectSuffix": "Page",
    "caseStyle": "PascalCase"
  },
  "gherkinStyle": "strict",
  "tagTaxonomy": ["@smoke", "@regression", "@P0", "@P1"],
  "generateFiles": "full"
}
```

| Field | Values | Default | Why |
|-------|--------|---------|-----|
| `customWrapperPackage` | npm package name or `null` | `null` | If your team has a shared base library (e.g. `@myorg/test-utils`), set this. AppForge will import from it instead of generating `BasePage.ts`. |
| `basePageStrategy` | `"extend"` \| `"compose"` \| `"custom"` | `"extend"` | `"extend"` = `class LoginPage extends BasePage`. `"compose"` = BasePage methods injected, no inherit. `"custom"` = LLM uses `schemaHint`. |
| `namingConvention.pageObjectSuffix` | `"Page"` \| `"Screen"` \| `"Component"` \| `"Flow"` | `"Page"` | Changes `LoginPage` → `LoginScreen` etc. throughout generated code. |
| `namingConvention.caseStyle` | `"PascalCase"` \| `"camelCase"` | `"PascalCase"` | Applies to all generated class and file names. |
| `gherkinStyle` | `"strict"` \| `"flexible"` | `"strict"` | `"strict"` = every scenario uses `Given/When/Then`. `"flexible"` = LLM uses best judgment. |
| `tagTaxonomy` | Array of strings | `["@smoke", "@regression"]` | Tells LLM which tags are valid in your project. Prevents generated scenarios using tags your test management system doesn't recognize. |
| `generateFiles` | `"full"` \| `"feature-steps"` \| `"feature-only"` | `"full"` | `"full"` = feature + steps + page object. `"feature-steps"` = skip page object (you write it). `"feature-only"` = just the Gherkin. |

**Critical**: Set `customWrapperPackage` if your team has a shared test library.  
AppForge will not generate files that duplicate what your library already provides.

---

## Section: `reuse` [RECOMMENDED]

```json
"reuse": {
  "locatorOrder": ["accessibility id", "resource-id", "xpath", "class chain", "predicate", "text"]
}
```

| Field | Used By | Why |
|-------|---------|-----|
| `locatorOrder` | `generate_cucumber_pom`, `self_heal_test`, `inspect_ui_hierarchy` | Priority order for selector strategy. `accessibility id` is always preferred (stable). `xpath` is last resort (brittle). This list tells ALL generation tools which strategy to pick first. |

**Recommended order (safest → most brittle)**:
1. `accessibility id` — uses `accessibilityLabel` / `content-desc` — never breaks on UI refactor
2. `resource-id` — Android resource IDs — breaks if devs rename the ID
3. `class chain` / `predicate` — iOS equivalents of resource-id
4. `text` — label matching — breaks on copy changes
5. `xpath` — avoid; use only when nothing else works

---

## Section: `builds` + `activeBuild` [OPTIONAL]

```json
"builds": {
  "debug": {
    "appPath": "builds/app-debug.apk",
    "bundleId": "com.example.debug",
    "serverUrl": "http://localhost:4723",
    "env": "local"
  },
  "release": {
    "appPath": "/CI/artifacts/app-release.apk",
    "env": "staging"
  }
},
"activeBuild": "debug"
```

| Field | Used By | Why |
|-------|---------|-----|
| `builds` | `inject_app_build`, `start_appium_session` | Named build profiles. Switching builds automatically injects the right `appium:app` path into capabilities. |
| `activeBuild` | `start_appium_session`, `check_environment` | Which build is currently active. Set via `inject_app_build` tool. |
| `builds[name].env` | `start_appium_session` | Links a build to an environment — session start can auto-switch `currentEnvironment`. |

---

## Section: `timeouts` [OPTIONAL]

```json
"timeouts": {
  "elementWait": 10000,
  "scenarioTimeout": 60000,
  "connectionRetry": 120000,
  "connectionRetryCount": 3,
  "appiumPort": 4723,
  "xmlCacheTtlMinutes": 5
}
```

| Field | Default | Used By | When to Change |
|-------|---------|---------|---------------|
| `elementWait` | `10000` ms | Generated `ActionUtils`, `WaitUtils` | On real devices (slow renders) or CI set to `20000+` |
| `scenarioTimeout` | `60000` ms | Generated `wdio.conf.ts` cucumberOpts | Tests with long flows or slow API calls — set to `120000` |
| `connectionRetry` | `120000` ms | Generated `wdio.conf.ts` | Slow emulator boot — set to `240000` |
| `connectionRetryCount` | `3` | Generated `wdio.conf.ts` | Flaky environments — set to `5` |
| `appiumPort` | `4723` | `start_appium_session`, `check_environment` | If your Appium server runs on a different port |
| `xmlCacheTtlMinutes` | `5` | `self_heal_test`, `inspect_ui_hierarchy` | Reduce on fast-UI apps; increase on slow real devices |

---

## Section: `selfHeal` [OPTIONAL]

```json
"selfHeal": {
  "confidenceThreshold": 0.7,
  "maxCandidates": 3,
  "autoApply": false
}
```

| Field | Default | Why |
|-------|---------|-----|
| `confidenceThreshold` | `0.7` | Only suggest candidates above this confidence score (0.0–1.0). Raise to `0.9` for conservative teams; lower to `0.5` for noisy UIs. |
| `maxCandidates` | `3` | How many replacement selectors to show. `1` = show only the best. `5` = show more options. |
| `autoApply` | `false` | If `true`, the LLM automatically applies the highest-confidence fix without user confirmation. Use only if your team trusts the self-heal logic. |

---

## Section: `reporting` [OPTIONAL]

```json
"reporting": {
  "format": "html",
  "outputDir": "reports",
  "screenshotOn": "failure"
}
```

| Field | Values | Default | Used By |
|-------|--------|---------|---------|
| `format` | `"html"` \| `"allure"` \| `"junit"` \| `"none"` | `"html"` | `setup_project` (wdio.conf reporters), `summarize_suite` |
| `outputDir` | Any path | `"reports"` | `summarize_suite`, `run_cucumber_test` |
| `screenshotOn` | `"failure"` \| `"always"` \| `"never"` | `"failure"` | Generated `hooks.ts` — controls when screenshots are captured |

---

## Progressive Config Strategy

You don't need all answers at setup time. Use this order:

```
Phase 1 (setup_project Phase 1):
  ✅ project.*          ← required, get now
  ✅ mobile.*           ← required, get now
  ⬜ paths.*            ← set if you know your structure
  ⬜ environments       ← set if you know your env names

Phase 2 (after running first test):
  ⬜ credentials        ← set via manage_users on first user management call
  ⬜ codegen.*          ← set when first code generation feels wrong
  ⬜ reuse.locatorOrder ← set when self-heal picks wrong strategies

Later (as you scale):
  ⬜ timeouts           ← set when tests flake on slow devices
  ⬜ selfHeal           ← set when healing feels too aggressive or too conservative
  ⬜ reporting          ← set when you need Allure or JUnit output for CI dashboards
```
