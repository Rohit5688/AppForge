# Phase 8 — Rich Scaffolding, Util Audit & LLM Guidance Hardening

**Date**: 2026-03-27  
**Branch**: `feature/phase8-scaffolding-hardening`  
**Status**: 📋 Planning

---

## Problem Statement

Three compounding problems make AppForge unreliable today:

1. **Scaffold is skeleton-only**: `setup_project` creates `BasePage.ts` and `MobileGestures.ts` but the util layer is thin — no waiting strategies, no assertion helpers, no data utils, no test context. Generated page objects end up calling `browser.*` directly instead of routing through utils. The layered wiring (features → steps → pages → utils → Appium) breaks immediately.

2. **Existing project audits are blind to util gaps**: When onboarding an existing repo, `analyze_codebase` discovers what *exists* but never compares it against the *full Appium API surface* to say "you're missing `scrollIntoView`, `dragAndDrop`, `handleOTP`…". The LLM is left guessing.

3. **LLM is headless (chicken with no head) in 12+ situations**: No device connected, wrong Appium version, version conflict in `package.json`, `bundleId` unknown for iOS, app not built yet, emulator not started — in all these cases the MCP returns a raw error with no guidance. The LLM either hallucinates a fix or loops helplessly.

---

## Architecture Target

```
Feature file (.feature)
    ↓
Step Definitions (*Steps.ts)
    ↓  calls methods on →
Page Objects (*Page.ts)  ← extends BasePage
    ↓  calls methods on →
Utils Layer (static classes)
    ├── AppiumDriver   — element find, waitFor, platform checks
    ├── GestureUtils   — swipe, pinch, scroll, drag
    ├── WaitUtils      — explicit waits, retry, poll until
    ├── AssertionUtils — isDisplayed, hasText, screenshotDiff
    ├── DataUtils      — env vars, test data, faker helpers
    └── TestContext    — scenario-scoped state bag
    ↓
WebdriverIO/Appium API
```

---

## Pillar 1 — Rich Scaffold (New Projects)

### P8-01 · Pinned compatible dependency versions

**Current problem**: `package.json` uses `^8.2.0` for WDIO packages and `^10.0.0` for Cucumber. When `npm install` runs 6 months later, it resolves breaking majors. Also `@wdio/appium-service` is included but Appium 2.x recommends running Appium externally.

**Fix in `ProjectSetupService.scaffoldPackageJson()`**: Use exact pinned versions that are tested to work together.

```json
{
  "@wdio/cli": "8.29.1",
  "@wdio/local-runner": "8.29.1",
  "@wdio/cucumber-framework": "8.29.1",
  "webdriverio": "8.29.1",
  "@cucumber/cucumber": "10.3.2",
  "ts-node": "10.9.2",
  "typescript": "5.4.5"
}
```

Remove `@wdio/appium-service` — Appium 2.x must be started externally. Update wdio configs to remove `services: ['appium']`.

**Files changed**: [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) ([scaffoldPackageJson](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts#100-136), [scaffoldWdioConfig](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts#677-731), [scaffoldWdioSharedConfig](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts#732-774))

---

### P8-02 · AppiumDriver util class (core wrapper)

New file scaffolded at `src/utils/AppiumDriver.ts`. Wraps the full WebdriverIO/Appium browser API surface into a structured, type-safe static class that page objects call directly:

**API surface**:
- `find(selector)`, `findAll`, `findByText`, `findByAccessibilityId`, `findByResourceId` (Android), `findByClassChain` (iOS), `findByPredicateString` (iOS)
- `isAndroid()`, `isIOS()`, `getPlatform()`, `getDeviceName()`, `getOsVersion()`
- `launchApp()`, `closeApp()`, `resetApp()`, `backgroundApp(seconds)`, `terminateApp(id)`, `activateApp(id)`, `getAppState(id)`
- `getContexts()`, `switchToWebView(index?)`, `switchToNative()`
- `setNetworkCondition(offline)` (Android), `setLocation(lat, lon)`
- `hideKeyboard()`, `isKeyboardShown()`, `pressKey(keyCode)`, `lockDevice()`, `unlockDevice()`, `rotate(orientation)`
- `takeScreenshot(filePath?)`, `getPageSource()`
- `acceptPermission()`, `denyPermission()`, `grantPermission(bundleId, permission)` (Android)
- `simulateFaceID(success)` (iOS), `simulateFingerprint(success)` (Android)
- `openUrl(url)`, `openDeepLink(url, bundleId?)`

---

### P8-03 · GestureUtils class (full gesture surface)

New file at `src/utils/GestureUtils.ts`. Replaces `MobileGestures.ts` as the canonical class (old file kept for backward compat):

**API surface**:
- `scrollUp/Down/Left/Right(percentage?)`, `scrollToElement(selector, maxSwipes?)`, `scrollToText(text)`, `scrollIntoView(element)`
- `swipeUp/Down/Left/Right(element?)`, `swipeCoordinates(x1, y1, x2, y2, duration?)`
- `tap(x, y)`, `tapElement(element)`, `doubleTap(element)`, `longPress(element, duration?)`, `longPressCoordinates(x, y, duration?)`
- `dragAndDrop(source, target)`
- `pinchIn(element, scale?)`, `pinchOut(element, scale?)`
- `acceptAlert()`, `dismissAlert()`, `getAlertText()`

---

### P8-04 · WaitUtils class

New file at `src/utils/WaitUtils.ts`:

**API surface**:
- `waitForDisplayed(selector, timeout?)`, `waitForEnabled`, `waitForClickable`, `waitForExist`
- `waitForNotDisplayed(selector, timeout?)`, `waitForNotExist`
- `waitForText(selector, text, timeout?)`, `waitForTextContains(selector, partial, timeout?)`
- `waitForAttributeValue(selector, attr, value, timeout?)`
- `waitForCondition(fn: () => Promise<boolean>, timeout?, pollInterval?)`
- `sleep(ms)`, `waitForPageLoad(timeout?)`
- `retryUntilSuccess<T>(fn, retries?, delay?)`

---

### P8-05 · AssertionUtils class

New file at `src/utils/AssertionUtils.ts`:

**API surface**:
- `assertDisplayed(selector, message?)`, `assertNotDisplayed`
- `assertText(selector, expected, message?)`, `assertTextContains`
- `assertEnabled(selector, message?)`, `assertDisabled`
- `assertChecked(selector, message?)`
- `assertAttributeValue(selector, attr, expected, message?)`
- `assertCount(selector, expectedCount, message?)`
- `assertUrl(expected, message?)` (WebView), `assertPageSource(contains, message?)`
- `assertScreenshot(name, tolerance?)` — visual baseline comparison

---

### P8-06 · TestContext class

New file at `src/utils/TestContext.ts` — scenario-scoped state bag that replaces `this.*` Cucumber World pattern:

**API surface**:
- `set<T>(key, value)`, `get<T>(key)`, `require<T>(key)` (throws if missing), `clear()`
- `addAttachment(name, data, mimeType)` — replaces `this.attach()`
- `setCurrentScenario(name)`, `getCurrentScenario()`

---

### P8-07 · DataUtils class

New file at `src/utils/DataUtils.ts`:

**API surface**:
- `getEnv(key, fallback?)`, `requireEnv(key)` (throws with clear message if missing)
- `loadJson<T>(filePath)`
- `randomString(length?)`, `randomEmail(prefix?)`, `randomPhone(countryCode?)`, `randomInt(min, max)`, `uuid()`
- `today(format?)`, `timestamp()`

---

### P8-08 · Refactor BasePage to delegate to utils

**Current problem**: `BasePage.ts` has inline `browser.*` calls for swipe, permissions, biometric — duplicating logic that belongs in utils. Generated page objects then can't reuse those → they also call `browser.*` directly.

**Fix**: `BasePage.ts` becomes a thin orchestration layer:

```typescript
import { AppiumDriver } from '../utils/AppiumDriver.js';
import { GestureUtils } from '../utils/GestureUtils.js';
import { WaitUtils } from '../utils/WaitUtils.js';
import { AssertionUtils } from '../utils/AssertionUtils.js';

export abstract class BasePage {
  protected driver = AppiumDriver;
  protected wait = WaitUtils;
  protected gesture = GestureUtils;
  protected assert = AssertionUtils;

  // Every page must implement this
  abstract isLoaded(): Promise<boolean>;

  async waitForLoaded(timeout = 15000): Promise<void> {
    await WaitUtils.waitForCondition(() => this.isLoaded(), timeout);
  }
}
```

Page objects extend [BasePage](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts#190-367) and call `this.driver.find(...)`, `this.gesture.scrollDown()`, `this.assert.assertDisplayed(...)` — never `browser.*` directly.

---

### P8-09 · Updated hooks.ts (TestContext + AppiumDriver)

```typescript
After(async function(scenario) {
  if (scenario.result?.status === Status.FAILED) {
    const screenshot = await AppiumDriver.takeScreenshot();
    TestContext.addAttachment('screenshot', Buffer.from(screenshot, 'base64'), 'image/png');
    const source = await AppiumDriver.getPageSource();
    TestContext.addAttachment('page-source', source, 'text/xml');
  }
  TestContext.clear();
});
```

---

### P8-10 · Updated setup summary and next-steps runbook

Replace the current flat 4-step summary with an ordered runbook:

```
Next steps:
  1. cd <projectRoot> && npm install
  2. Start Appium server (separate terminal): npx appium
  3. Run check_environment to verify: Appium, drivers, device
  4. Update wdio.conf.ts with your device name and app path
  5. Run start_appium_session to verify live device connection
  6. Run generate_cucumber_pom to create your first feature
  7. Run validate_and_write to write files, then run_cucumber_test to execute
```

---

## Pillar 2 — Util Gap Audit (Existing Projects)

### P8-11 · Canonical Appium API surface registry

New file `src/data/appiumApiSurface.ts` — static registry of ~60 known Appium/WDIO commands organized by category and mapped to the util class that should own them:

```typescript
export interface ApiEntry {
  category: 'element' | 'gesture' | 'wait' | 'assertion' | 'device' | 'app' | 'context' | 'network';
  method: string;               // canonical method name
  aliases: string[];            // fuzzy match alternatives
  description: string;
  platform: 'android' | 'ios' | 'both';
  suggestedUtilClass: string;   // AppiumDriver | GestureUtils | WaitUtils | etc.
  suggestedCode: string;        // ready-to-paste TypeScript snippet
}
```

---

### P8-12 · New `audit_utils` MCP tool

**Algorithm**:
1. Run `CodebaseAnalyzerService.analyze()` → get `existingUtils` (method names)
2. Normalize all discovered method names (lowercase, strip class prefix)
3. Load `APPIUM_API_SURFACE` entries
4. Fuzzy-match each API entry against discovered methods
5. Build gap report grouped by category

**Output**:
```json
{
  "coveragePercent": 42,
  "present": ["scrollUp", "swipeLeft", "waitForDisplayed"],
  "missing": [
    {
      "category": "gesture",
      "method": "dragAndDrop",
      "platform": "both",
      "suggestedUtil": "GestureUtils",
      "suggestedFile": "src/utils/GestureUtils.ts",
      "suggestedCode": "static async dragAndDrop(source, target) { ... }"
    }
  ],
  "actionableSuggestions": [
    "Add GestureUtils.dragAndDrop() to src/utils/GestureUtils.ts",
    "Add WaitUtils.retryUntilSuccess() to src/utils/WaitUtils.ts"
  ]
}
```

**New files**: `src/services/UtilAuditService.ts`, `src/data/appiumApiSurface.ts`  
**Modified**: [src/index.ts](file:///c:/Users/Rohit/mcp/AppForge/src/index.ts) (register `audit_utils` tool)

---

### P8-13 · `upgrade_project` emits util gap suggestions

When `upgrade_project` runs, after config migration it automatically runs the util audit. If coverage < 70%, it appends a `🔧 Util coverage suggestions` block to the output so users see gaps without knowing to call `audit_utils`.

**Modified**: [src/services/ProjectMaintenanceService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectMaintenanceService.ts)

---

## Pillar 3 — Interactive Setup & LLM Guidance Hardening

### Gap Inventory — 12 Headless Situations

| # | Situation | Current behavior | Fix |
|---|-----------|-----------------|-----|
| G-01 | `setup_project` — no platform or app name provided | Defaults silently to android/MyMobileApp | Ask: "What platform? [android / ios / both]" + "What is your app name?" |
| G-02 | `check_environment` — no device/emulator connected | Returns `fail` with adb error | Ask: "No device detected. Do you want help starting an emulator? [Yes — show AVD list / No — I'll connect manually]" |
| G-03 | `start_appium_session` — no `appium:app` in capabilities | Session fails with cryptic "Could not start a new session" | Detect missing cap → ask: "Provide path to .apk/.ipa, or choose 'noReset: true' for already-installed app" |
| G-04 | `start_appium_session` — iOS: `bundleId` missing | Error buried in Appium logs | Detect iOS + missing bundleId → ask user to provide it |
| G-05 | `run_cucumber_test` — no `executionCommand` in config | Guesses `npx wdio` | Ask: "What is your test run command? [npx wdio run wdio.conf.ts / npm test / custom]" |
| G-06 | `validate_and_write` — TypeScript compile fails | Returns raw tsc errors | Parse tsc errors, classify (missing import / wrong type / type alias), give targeted fix hint |
| G-07 | `generate_cucumber_pom` — no page objects detected | Generates with no context | Ask: "No pages found. Create a new page or map to an existing file?" + list any detected TS files |
| G-08 | `upgrade_project` — config has custom `paths` | May overwrite custom paths | Show diff, ask: "Custom paths detected. Keep existing or reset to defaults?" |
| G-09 | `check_environment` — Appium 1.x detected | Warns generically | Detect 1.x, explain W3C incompatibilities, ask: "Migrate to Appium 2.x?" + provide migration command |
| G-10 | `inject_app_build` — file path doesn't exist | Saves non-existent path | Check `fs.existsSync`, ask: "File not found. Save path anyway (for CI), or provide correct path?" |
| G-11 | `setup_project` post-scaffold | No npm install warning | Print: "Run `npm install` in <projectRoot>. If peer dep errors: add `--legacy-peer-deps`" |
| G-12 | Any tool — `mcp-config.json` is corrupt/invalid JSON | Parse error crash | Catch JSON parse error, classify issue (trailing comma, missing brace), ask: "Config appears corrupt. Reset to defaults or view the file?" |

---

### P8-14 · Questioner helper + dispatcher catch

**New class** `src/utils/Questioner.ts`:

```typescript
export class ClarificationRequired extends Error {
  constructor(
    public readonly question: string,
    public readonly context: string,
    public readonly options?: string[]
  ) { super(question); }
}

export class Questioner {
  static clarify(question: string, context: string, options?: string[]): never {
    throw new ClarificationRequired(question, context, options);
  }
}
```

**In dispatcher** [src/index.ts](file:///c:/Users/Rohit/mcp/AppForge/src/index.ts) — catch block addition:

```typescript
} catch (err: any) {
  if (err instanceof ClarificationRequired) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          action: 'CLARIFICATION_REQUIRED',
          question: err.question,
          context: err.context,
          options: err.options ?? []
        }, null, 2)
      }]
    };
  }
  // ... existing error handling
}
```

This converts all ambiguity situations from silent failures into structured interactive prompts the LLM can act on.

---

### P8-15 · Locator advisory in `generate_cucumber_pom`

When called without live session and without `screenXml`, prepend to the prompt:

```
⚠️ LOCATOR QUALITY ADVISORY
No live session active and no screenXml provided.
Generated locators will be PLACEHOLDER GUESSES — they will likely fail.

RECOMMENDED workflow:
  1. start_appium_session (connect to device)
  2. Navigate to the target screen using perform_action
  3. Call inspect_ui_hierarchy (no arguments) to get live XML
  4. Re-call generate_cucumber_pom with that XML for accurate locators
```

---

### P8-16 · Structured error taxonomy

All thrown errors should include an error code and remediation. New file `src/utils/ErrorCodes.ts`:

```typescript
export enum ErrorCode {
  E001_NO_SESSION        = 'E001_NO_SESSION',
  E002_DEVICE_OFFLINE    = 'E002_DEVICE_OFFLINE',
  E003_APP_NOT_FOUND     = 'E003_APP_NOT_FOUND',
  E004_DRIVER_MISSING    = 'E004_DRIVER_MISSING',
  E005_CONFIG_CORRUPT    = 'E005_CONFIG_CORRUPT',
  E006_TS_COMPILE_FAIL   = 'E006_TS_COMPILE_FAIL',
  E007_AMBIGUITY         = 'E007_AMBIGUITY',
  E008_PRECONDITION_FAIL = 'E008_PRECONDITION_FAIL',
}

export class AppForgeError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly remediation: string[]
  ) { super(message); }
}
```

Every catch block in services should throw `AppForgeError` instead of raw `Error`. The dispatcher serializes it with the [code](file:///c:/Users/Rohit/mcp/AppForge/src/services/EnvironmentCheckService.ts#172-183) + `remediation` so the LLM can pattern-match and act.

---

## Delivery Order

| Priority | ID | Work Item | File(s) |
|----------|----|-----------|---------|
| P0 | P8-01 | Pin dependency versions, remove appium-service | [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) |
| P0 | P8-14 | `Questioner` helper + dispatcher catch | `src/utils/Questioner.ts`, [src/index.ts](file:///c:/Users/Rohit/mcp/AppForge/src/index.ts) |
| P0 | P8-16 | Structured error taxonomy | `src/utils/ErrorCodes.ts`, all services |
| P1 | P8-02 | Scaffold `AppiumDriver.ts` | [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) |
| P1 | P8-03 | Scaffold `GestureUtils.ts` | [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) |
| P1 | P8-04 | Scaffold `WaitUtils.ts` | [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) |
| P1 | P8-05 | Scaffold `AssertionUtils.ts` | [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) |
| P1 | P8-06 | Scaffold `TestContext.ts` | [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) |
| P1 | P8-07 | Scaffold `DataUtils.ts` | [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) |
| P1 | P8-08 | Refactor `BasePage.ts` → delegates to utils | [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) |
| P1 | P8-09 | Update `hooks.ts` → TestContext | [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) |
| P1 | P8-10 | Setup summary runbook | [ProjectSetupService.ts](file:///c:/Users/Rohit/mcp/AppForge/src/services/ProjectSetupService.ts) |
| P2 | P8-11 | Appium API surface registry | `src/data/appiumApiSurface.ts` (new) |
| P2 | P8-12 | `audit_utils` tool + `UtilAuditService` | `src/services/UtilAuditService.ts` (new), [src/index.ts](file:///c:/Users/Rohit/mcp/AppForge/src/index.ts) |
| P2 | P8-13 | Integrate util audit into `upgrade_project` | `ProjectMaintenanceService.ts` |
| P2 | G-01–G-12 | Interactive guidance gaps (all 12) | Various services |
| P3 | P8-15 | Locator advisory in `generate_cucumber_pom` | `TestGenerationService.ts` |

---

## Status Table

| ID | Item | Status |
|----|------|--------|
| P8-01 | Pin dependency versions | 🔲 Pending |
| P8-02 | Scaffold AppiumDriver.ts | 🔲 Pending |
| P8-03 | Scaffold GestureUtils.ts | 🔲 Pending |
| P8-04 | Scaffold WaitUtils.ts | 🔲 Pending |
| P8-05 | Scaffold AssertionUtils.ts | 🔲 Pending |
| P8-06 | Scaffold TestContext.ts | 🔲 Pending |
| P8-07 | Scaffold DataUtils.ts | 🔲 Pending |
| P8-08 | Refactor BasePage → utils | 🔲 Pending |
| P8-09 | hooks.ts → TestContext | 🔲 Pending |
| P8-10 | Setup summary runbook | 🔲 Pending |
| P8-11 | Appium API surface registry | 🔲 Pending |
| P8-12 | audit_utils tool | 🔲 Pending |
| P8-13 | upgrade_project util audit | 🔲 Pending |
| P8-14 | Questioner + dispatcher | 🔲 Pending |
| P8-15 | Locator advisory | 🔲 Pending |
| P8-16 | Structured error taxonomy | 🔲 Pending |
| G-01 | Interactive platform/appName | 🔲 Pending |
| G-02 | Device-offline guidance | 🔲 Pending |
| G-03 | Missing appPath prompt | 🔲 Pending |
| G-04 | iOS bundleId check | 🔲 Pending |
| G-05 | Missing executionCommand | 🔲 Pending |
| G-06 | TSC error classifier | 🔲 Pending |
| G-07 | No-page-objects guidance | 🔲 Pending |
| G-08 | Custom-paths confirmation | 🔲 Pending |
| G-09 | Appium version guidance | 🔲 Pending |
| G-10 | App path exists check | 🔲 Pending |
| G-11 | NPM install note | 🔲 Pending |
| G-12 | Corrupt config recovery | 🔲 Pending |

---

## Acceptance Criteria

- Scaffolded project includes [AppiumDriver](file:///c:/Users/Rohit/mcp/AppForge/src/services/EnvironmentCheckService.ts#113-150), `GestureUtils`, `WaitUtils`, `AssertionUtils`, `DataUtils`, `TestContext`
- `BasePage.ts` never calls `browser.*` directly — always via utils
- `package.json` uses pinned exact versions with no peer conflict
- `audit_utils` tool produces structured gap report
- `upgrade_project` emits util gap suggestions when coverage < 70%
- All 12 guidance gaps return `CLARIFICATION_REQUIRED` JSON or structured `AppForgeError` with `remediation[]`
- `generate_cucumber_pom` without live XML shows locator advisory
- No existing tool, hook, or scaffolded file behavior is broken
