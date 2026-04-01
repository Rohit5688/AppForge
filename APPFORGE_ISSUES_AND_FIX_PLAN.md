# AppForge MCP — Issue Report & Fix Plan

**Prepared for:** AppForge Developer  
**Date:** 2026-03-30  
**Environment:** macOS, Node v20.19.3, Appium 3.0.2, iOS Simulator (iPhone 17 Pro)

---

## Overview

Three bugs were identified and fixed while using AppForge MCP with a real Appium v3 project.
All fixes have been applied to the local AppForge source and confirmed working.

---

## Issue 1 — `start_appium_session`: Wrong Appium Endpoint (Appium v3 Incompatibility)

### Severity: 🔴 Critical (Blocks live session entirely)

### Symptom
```
Error: WebDriverError: The requested resource could not be found, or a request was
received using an HTTP method that is not supported by the mapped resource.
when running "http://localhost:4723/wd/hub/session" with method "POST"
```

### Root Cause
`AppiumSessionService.ts` hardcodes the WebdriverIO `path` option as `'/wd/hub'`:

```typescript
// BEFORE (broken for Appium v3)
this.driver = await remote({
  protocol: 'http',
  hostname: parsedUrl.hostname,
  port: parseInt(parsedUrl.port || '4723'),
  path: '/wd/hub',   // ← hardcoded legacy v2 path
  capabilities
});
```

**Appium v3 removed `/wd/hub` entirely.** It only supports the W3C-compliant endpoint `/session`.

| Appium Version | Correct `path` | Session URL |
|----------------|---------------|-------------|
| v1 / v2        | `/wd/hub`     | `POST /wd/hub/session` |
| v3+            | `/`           | `POST /session` |

### Fix Applied
Auto-detect Appium version by probing `GET /status` before creating the WebdriverIO session:

```typescript
// AFTER (works for both v2 and v3)
const parsedUrl = new URL(serverUrl);
let appiumPath = '/wd/hub'; // default: Appium v2
try {
  const statusResp = await fetch(`${parsedUrl.protocol}//${parsedUrl.host}/status`);
  const statusJson = await statusResp.json() as any;
  const version: string = statusJson?.value?.build?.version ?? '';
  const major = parseInt(version.split('.')[0] ?? '0', 10);
  if (major >= 3) {
    appiumPath = '/';
  }
} catch {
  // Could not reach /status — keep default /wd/hub
}

this.driver = await remote({
  protocol: 'http',
  hostname: parsedUrl.hostname,
  port: parseInt(parsedUrl.port || '4723'),
  path: appiumPath,  // ← dynamically set
  capabilities
});
```

**File:** `src/services/AppiumSessionService.ts`

---

## Issue 2 — `start_appium_session`: MCP Timeout ("Connection closed")

### Severity: 🔴 Critical (Blocks live session entirely)

### Symptom
```
Error executing MCP tool: MCP error -32000: Connection closed
```

This appeared after fixing Issue 1. The MCP server's stdio transport closed before returning a response — effectively a crash from the Cline MCP client's perspective.

### Root Cause
When `appium:noReset` is `false` (the default in project configs), Appium reinstalls the entire `.ipa` before creating a new session. On XCUITest this takes **~35 seconds**.

The Cline MCP client framework has a tool response timeout shorter than 35 seconds. When `start_appium_session` blocked for 35s waiting for XCUITest installation, the MCP client closed the stdio transport — producing `"Connection closed"`.

**Timing measured:**
```
POST /session started:  11:30:31
Session created:        11:31:06
Total startup time:     ~35 seconds  ← exceeds MCP timeout
```

### Fix Applied
For **live inspection sessions**, the app is already installed — reinstalling is never needed and defeats the purpose of inspection. Override `noReset` unconditionally in `startSession()`:

```typescript
// In AppiumSessionService.startSession()
const capabilities = this.resolveCapabilities(config, profileName);

// For live inspection sessions always use noReset:true — we never want to
// reinstall the app (slow, 30-55s XCUITest init) just to inspect the screen.
capabilities['appium:noReset'] = true;
```

**After fix:** Session startup time dropped from **~35s → ~5–10s**.

**File:** `src/services/AppiumSessionService.ts`

### Recommendation for Developer
Consider exposing a `forceReinstall: boolean` parameter on `start_appium_session` for cases where the user explicitly wants a fresh install. The default should remain `noReset: true` since the tool's purpose is UI inspection, not test execution.

---

## Issue 3 — `upgrade_project`: Infinite CLARIFICATION_REQUIRED Loop

### Severity: 🟡 High (Blocks upgrade_project entirely)

### Symptom
Every call to `upgrade_project` returns:
```json
{
  "action": "CLARIFICATION_REQUIRED",
  "question": "Custom paths detected in mcp-config.json. Should upgrade overwrite paths to defaults?",
  "options": ["Yes, overwrite to defaults", "No, keep my custom paths"]
}
```

No matter what answer is provided (including passing `answer` in the tool arguments), the same response repeats indefinitely. The upgrade never completes.

### Root Cause
**Two compounding bugs:**

**Bug 3a — `Questioner.clarify()` always throws, never returns**

`Questioner.clarify()` is implemented as:
```typescript
export class Questioner {
  static clarify(question, context, options) {
    throw new ClarificationRequired(question, context, options);  // always throws
  }
}
```

The MCP server catches `ClarificationRequired` and serializes it as a `CLARIFICATION_REQUIRED` response. But since `clarify()` throws, execution **never continues past the call site** — the rest of `upgradeProject()` never runs.

**Bug 3b — The tool schema has no `answer` parameter**

```typescript
// In index.ts — upgrade_project tool definition
name: "upgrade_project",
inputSchema: {
  type: "object",
  properties: {
    projectRoot: { type: "string" }
    // ← No "answer" field
  },
  required: ["projectRoot"]
}
```

There is no mechanism to pass the user's answer back. Even if the client sends `{ projectRoot: "...", answer: "No, keep my custom paths" }`, the handler only reads `args.projectRoot`:

```typescript
case "upgrade_project":
  return this.textResult(
    await this.projectMaintenanceService.upgradeProject(args.projectRoot)
    // ← args.answer is never passed
  );
```

**Bug 3c — The clarification question is misleading**

Even if the clarification flow worked, the code after the `Questioner.clarify()` call **never overwrites custom paths**. It only adds a `version` field to `mcp-config.json` if missing. The clarification prompt implies paths would be overwritten, but no such code exists.

```typescript
// Code after clarification — does NOT touch paths at all
if (!config.version) {
  config.version = '1.0.0';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  logs.push('✅ Migrated mcp-config.json to standard versioning format.');
}
```

### Fix Applied
Replace the blocking `Questioner.clarify()` call with a non-blocking log notice:

```typescript
// BEFORE (blocks forever)
if (config.paths && Object.keys(config.paths).length > 0) {
  Questioner.clarify(
    "Custom paths detected in mcp-config.json. Should upgrade overwrite paths to defaults?",
    "You have custom paths configured...",
    ["Yes, overwrite to defaults", "No, keep my custom paths"]
  );
}

// AFTER (logs and continues)
if (config.paths && Object.keys(config.paths).length > 0) {
  logs.push('ℹ️  Custom paths detected in mcp-config.json — your paths will be preserved (upgrade never overwrites custom paths).');
}
```

**File:** `src/services/ProjectMaintenanceService.ts`

### Recommendation for Developer

The `Questioner` pattern is fundamentally incompatible with "mid-function" decision gates because `clarify()` always throws and the MCP protocol has no built-in state continuation after a clarification round-trip.

**Recommended patterns:**

**Option A — Pre-flight parameter (preferred):**
Add an optional `keepCustomPaths: boolean` parameter to `upgrade_project`. The client sets it on first call (after reading the tool description), no mid-execution pause needed.

```typescript
// Tool schema
properties: {
  projectRoot: { type: "string" },
  keepCustomPaths: {
    type: "boolean",
    description: "Set to false to overwrite custom paths with defaults. Default: true (preserve custom paths).",
    default: true
  }
}

// Handler
case "upgrade_project":
  return this.textResult(
    await this.projectMaintenanceService.upgradeProject(
      args.projectRoot,
      args.keepCustomPaths ?? true
    )
  );
```

**Option B — Separate continuation tool:**
Use `Questioner.clarify()` only at the START of a function (before any side effects), and implement a separate `upgrade_project_confirm` tool that accepts the answer. Not ideal — two tool calls for one operation.

**Option C — Remove clarification entirely (current fix):**
Since the upgrade never overwrites custom paths anyway, the clarification was both misleading and unnecessary. A log notice is sufficient. ✅ **This is the fix applied.**

---

## Summary Table

| # | Issue | Tool | Severity | Status | File Fixed |
|---|-------|------|----------|--------|-----------|
| 1 | Appium v3 path `/wd/hub` hardcoded | `start_appium_session` | 🔴 Critical | ✅ Fixed | `AppiumSessionService.ts` |
| 2 | `noReset:false` → 35s install → MCP timeout | `start_appium_session` | 🔴 Critical | ✅ Fixed | `AppiumSessionService.ts` |
| 3 | `Questioner.clarify()` blocks upgrade forever | `upgrade_project` | 🟡 High | ✅ Fixed | `ProjectMaintenanceService.ts` |

---

## Confirmed Working After Fixes

### Live Session (Issue 1 + 2)
```
start_appium_session  → Session 4878b779 on iPhone 17 Pro (5-10s startup) ✅
inspect_ui_hierarchy  → 19 elements, full XML, screenshot ✅
end_appium_session    → Terminated cleanly ✅
```

### Upgrade Project (Issue 3)
```
upgrade_project → 
  ℹ️  Custom paths preserved
  💡 monolithic wdio.conf.ts tip shown
  📊 Utility Coverage: 25%
  ✅ Standard scaffolding files verified/repaired
```
(npm dep update failed separately due to Node v20 vs pipenet requiring v22 — unrelated to these bugs)

---

## Environment Details

| Item | Value |
|------|-------|
| AppForge version | 1.0.0 |
| Appium version | 3.0.2 |
| Node.js | v20.19.3 |
| Platform | iOS / XCUITest |
| Device | iPhone 17 Pro (simulator) |
| App | com.experian.experianapp.dev |
| MCP client | Cline (VS Code extension) |

---

## Files Changed

| File | Change Summary |
|------|---------------|
| `src/services/AppiumSessionService.ts` | Auto-detect Appium v3 path + force noReset:true |
| `src/services/ProjectMaintenanceService.ts` | Replace Questioner.clarify() with log notice |
| `dist/services/AppiumSessionService.js` | Compiled output |
| `dist/services/ProjectMaintenanceService.js` | Compiled output |