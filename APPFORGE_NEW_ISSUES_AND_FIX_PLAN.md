# AppForge MCP — New Issue Report & Fix Plan (v2)

**Prepared for:** AppForge Developer  
**Date:** 2026-03-30  
**Verification status of previously reported issues:** Issues 1 & 2 confirmed fixed ✅, Issue 3 still open ⚠️  
**Source reviewed:** `src/services/AppiumSessionService.ts`, `src/services/ProjectMaintenanceService.ts`, `src/services/McpConfigService.ts`, `src/services/EnvironmentCheckService.ts`, `src/services/ExecutionService.ts`, `src/index.ts`

---

## Previously Reported Issues — Verification

| # | Description | Dev Fix | Verified |
|---|-------------|---------|---------|
| 1 | `start_appium_session`: Appium v3 path `/wd/hub` hardcoded | `detectAppiumPath()` probes `/status` then `/wd/hub/status` | ✅ Confirmed fixed |
| 2 | `start_appium_session`: `noReset:false` causes 35s reinstall → MCP timeout | `capabilities['appium:noReset'] = true` override added | ✅ Confirmed fixed |
| 3 | `upgrade_project`: `Questioner.clarify()` infinite loop | Not addressed yet | ⚠️ Still open (locally patched) |

---

## New Issues Found

---

## Issue 4 — `start_appium_session`: `Questioner.clarify()` Still Blocks When `noReset:false` + No `appium:app`

### Severity: 🔴 Critical

### Symptom
```
CLARIFICATION_REQUIRED: "No app or browser specified in capabilities..."
```
Users whose `mcp-config.json` has `appium:noReset: false` (or not set) and no `appium:app` path (iOS users using `bundleId` only) still get blocked by `CLARIFICATION_REQUIRED` even after the Issue 2 fix.

### Root Cause
In `startSession()`, the `noReset` override is applied **AFTER** `resolveCapabilities()` returns:

```typescript
// startSession() — CURRENT ORDER (broken)
const capabilities = this.resolveCapabilities(config, profileName);
//   ↑ resolveCapabilities() THROWS here if noReset=false + no app path

capabilities['appium:noReset'] = true;   // ← never reached
```

Inside `resolveCapabilities()`, the validation check fires with the **original** config value (`noReset: false`), not the overridden one:

```typescript
// resolveCapabilities() — lines 280-287 in AppiumSessionService.ts
if (!caps['appium:app'] && !caps['appium:noReset'] && ...) {
  Questioner.clarify(
    "No app or browser specified in capabilities...",
    ...
  );  // THROWS — startSession() never reaches the noReset=true override
}
```

**Affected users:** Any iOS user with only `bundleId` in their caps (no `appium:app` path) and `noReset: false`.

### Fix
Move the `noReset` override BEFORE `resolveCapabilities()` is called, OR apply it as a pre-override into the raw config:

```typescript
// Option A — Pre-patch config before resolveCapabilities (recommended)
const config = this.configService.read(projectRoot);

// Inject noReset before capability validation runs
const profileName_ = profileName ?? Object.keys(config.mobile.capabilitiesProfiles)[0];
if (config.mobile.capabilitiesProfiles[profileName_]) {
  config.mobile.capabilitiesProfiles[profileName_]['appium:noReset'] = true;
}

const capabilities = this.resolveCapabilities(config, profileName);
// noReset override no longer needed here — it's already in the caps

// Option B — Skip the validation entirely inside resolveCapabilities for live sessions
// Pass a flag: resolveCapabilities(config, profileName, { skipNoResetCheck: true })
```

**File:** `src/services/AppiumSessionService.ts`

---

## Issue 5 — `check_environment`: Appium 1.x Detection Blocks Entire Environment Check

### Severity: 🟡 High

### Symptom
When Appium 1.x is running, `check_environment` returns `CLARIFICATION_REQUIRED` and never produces an environment report. The user never sees their full environment status.

### Root Cause
In `EnvironmentCheckService.ts` (line ~38), after pushing the Appium check result, the code calls `Questioner.clarify()`:

```typescript
const appiumCheck = await this.checkAppiumServer();
checks.push(appiumCheck);

if (appiumCheck.status === 'warn' && appiumCheck.message.includes('1.x')) {
  Questioner.clarify(            // THROWS — check_environment never returns
    "Migrate to Appium 2.x?",
    ...
  );
}

// ↓ These checks never run:
checks.push(await this.checkAppiumDrivers(platform));
// ...
return { ready, checks, summary };   // ← never reached
```

The user gets stuck in a CLARIFICATION_REQUIRED loop. No matter how they answer, the next call re-runs the same check and throws again.

### Fix
Remove the `Questioner.clarify()` call. The `checkAppiumServer()` result already includes `fixHint: 'Upgrade to Appium 2.x: npm install -g appium@latest'`. A warning result with a fix hint is sufficient.

```typescript
// BEFORE (blocks check_environment)
if (appiumCheck.status === 'warn' && appiumCheck.message.includes('1.x')) {
  Questioner.clarify("Migrate to Appium 2.x?", ...);
}

// AFTER (non-blocking — report continues)
// No action needed — checkAppiumServer() already returns status:'warn' with fixHint
// The summary report will show the warning with the upgrade instruction
```

**File:** `src/services/EnvironmentCheckService.ts`

---

## Issue 6 — `check_environment`: No Android Device Makes Fail Result Unreachable (Dead Code)

### Severity: 🟡 High

### Symptom
When no Android device/emulator is connected, `check_environment` returns `CLARIFICATION_REQUIRED` instead of an environment report showing the device check as failed. Users get stuck in a loop instead of seeing actionable failure output.

### Root Cause
In `checkAndroidEmulator()`:

```typescript
if (lines.length > 0) {
  return { name: 'Android Device', status: 'pass', ... };
}

Questioner.clarify(
  "No device detected. Do you want help starting an emulator?",
  ...
);  // THROWS — execution never reaches the return below

return { name: 'Android Device', status: 'fail', ... };  // ← DEAD CODE, never executed
```

The `return { status: 'fail' }` on the last line **can never execute** because `Questioner.clarify()` always throws. The `catch` block re-throws it (`if (e instanceof Error && e.name === 'ClarificationRequired') throw e;`), propagating the exception up through `check_environment`.

This affects **all Android users** running `check_environment` without a connected emulator — which is a very common first-run scenario.

### Fix
Remove the `Questioner.clarify()` call entirely. The existing fail result with `fixHint` already guides the user:

```typescript
// BEFORE (dead code + blocking clarification)
Questioner.clarify(
  "No device detected. Do you want help starting an emulator?",
  ...
);
return { name: 'Android Device', status: 'fail', message: 'No devices connected', fixHint: '...' };

// AFTER (returns useful fail result)
return {
  name: 'Android Device',
  status: 'fail',
  message: 'No devices connected',
  fixHint: 'Start an emulator:\n  emulator -avd <avd_name>\n\nList AVDs: emulator -list-avds\n\nOr connect a physical device with USB debugging enabled.'
};
```

Also remove the corresponding `catch` re-throw for `ClarificationRequired` since it's no longer needed.

**File:** `src/services/EnvironmentCheckService.ts`

---

## Issue 7 — `run_cucumber_test`: No `executionCommand` Blocks Tool With No Answer Mechanism

### Severity: 🟡 High

### Symptom
When `mcp-config.json` has no `project.executionCommand` field and the user doesn't pass `overrideCommand`, `run_cucumber_test` returns `CLARIFICATION_REQUIRED`. There is no `answer` parameter in the tool schema, so a new user who hasn't configured `executionCommand` can never run tests.

### Root Cause
In `ExecutionService.ts` (line ~65):

```typescript
if (options?.overrideCommand) {
  command = options.overrideCommand;
} else if (config?.project.executionCommand) {
  command = config.project.executionCommand;
} else {
  Questioner.clarify(
    "No default test script found. What command runs your tests?",
    ...
    ["npm run test", "npx wdio run wdio.conf.ts", "npm run e2e:android"]
  );  // THROWS — but no mechanism to pass the answer back as overrideCommand
}
```

The `run_cucumber_test` tool schema does have an `overrideCommand` parameter. But when `CLARIFICATION_REQUIRED` is returned, nothing in the response tells the client to pass the answer as `overrideCommand` — it looks like any other clarification response.

### Fix
Two options:

**Option A — Default to wdio.conf.ts if config missing:**
```typescript
} else {
  // No executionCommand configured — fall back to convention-based default
  const defaultConf = fs.existsSync(path.join(projectRoot, 'wdio.conf.ts'))
    ? 'wdio.conf.ts' : 'wdio.conf.js';
  command = `npx wdio run ${defaultConf}`;
  logs.push(`ℹ️  No executionCommand in mcp-config.json — using default: ${command}`);
}
```

**Option B — Return actionable error (not CLARIFICATION_REQUIRED):**
```typescript
} else {
  throw new Error(
    'No test execution command configured. Add to mcp-config.json:\n' +
    '  "project": { "executionCommand": "npx wdio run wdio.conf.ts" }\n' +
    'Or pass overrideCommand in the tool arguments.'
  );
}
```

**File:** `src/services/ExecutionService.ts`

---

## Issue 8 — `inject_app_build`: File-Not-Found Blocks Tool With No Answer Mechanism

### Severity: 🟡 Medium

### Symptom
When the `appPath` provided to `inject_app_build` doesn't exist on disk, the tool returns `CLARIFICATION_REQUIRED`. The tool schema has no `answer` parameter and no `saveAnyway` parameter. Users trying to set a CI path (file not yet built) are permanently blocked.

### Root Cause
In `McpConfigService.ts` (line ~137):

```typescript
public updateAppPath(projectRoot: string, platform: 'android' | 'ios', appPath: string): void {
  if (!fs.existsSync(appPath) && !appPath.startsWith('http')) {
    Questioner.clarify(
      `File not found at ${appPath}. Save path anyway (for CI), or provide correct path?`,
      ...
      ["Save path anyway (I'll do it manually)", "I will provide a corrected path"]
    );  // THROWS — inject_app_build never saves the path
  }
  // ...
}
```

The clarification asks "Save anyway?" but there's no way to answer "yes" — calling the tool again with the same `appPath` just throws again.

### Fix
Add a `forceWrite: boolean` parameter to `inject_app_build`:

```typescript
// Tool schema addition
properties: {
  projectRoot: { type: "string" },
  platform: { type: "string" },
  appPath: { type: "string" },
  forceWrite: {
    type: "boolean",
    description: "Set to true to save the path even if the file doesn't exist on disk (useful for CI pipelines where the build artifact isn't local).",
    default: false
  }
}

// McpConfigService.updateAppPath() — add forceWrite param
public updateAppPath(projectRoot, platform, appPath, forceWrite = false): void {
  if (!fs.existsSync(appPath) && !appPath.startsWith('http') && !forceWrite) {
    // Return a warning log instead of throwing
    console.warn(`[AppForge] ⚠️ appPath does not exist on disk: ${appPath}. Saving anyway (forceWrite was not set).`);
  }
  // proceed with save regardless
}
```

**File:** `src/services/McpConfigService.ts`, `src/index.ts`

---

## Issue 3 (Carry-over) — `upgrade_project`: Questioner.clarify() Infinite Loop

### Severity: 🟡 High  
### Status: Locally patched — NOT yet fixed by dev

_Detailed root cause analysis in previous report `APPFORGE_ISSUES_AND_FIX_PLAN.md`._

**Quick summary:**  
`Questioner.clarify()` in `ProjectMaintenanceService.upgradeProject()` always throws → upgrade never completes.  
The clarification question ("overwrite custom paths?") is misleading — the code after it never overwrites paths anyway.

**Local patch applied:**  
Replace `Questioner.clarify()` with `logs.push('ℹ️ Custom paths will be preserved...')`.

**File:** `src/services/ProjectMaintenanceService.ts`

---

## Root Cause Pattern — `Questioner` Anti-Pattern

All issues 3–8 share the same root design flaw: **`Questioner.clarify()` throws unconditionally**, making it impossible to use as a mid-function decision gate.

### Current Pattern (broken)
```
Tool called
  → Questioner.clarify() throws ClarificationRequired
  → MCP server catches it → serialises as CLARIFICATION_REQUIRED JSON
  → Client receives it → user sees question
  → Client calls tool again (same args, no answer field)
  → Same check runs → Questioner.clarify() throws again
  → ∞ loop
```

### Correct Pattern (recommended)
```
Tool called (missing required input)
  → Tool schema pre-declares all required fields
  → MCP client (LLM) fills them before calling
  → Tool handler receives complete args
  → Runs without interruption
```

### Recommended Global Fix: Pre-flight Schema Validation

For every tool that currently uses `Questioner.clarify()` to ask for a missing input, **add the parameter to the tool's `inputSchema`** and use it in the handler. The MCP client (LLM) will ask the user BEFORE calling the tool.

| Tool | Missing Input | Add to Schema |
|------|--------------|---------------|
| `run_cucumber_test` | execution command | `overrideCommand` (already exists!) |
| `inject_app_build` | force-overwrite flag | `forceWrite: boolean` |
| `check_environment` | migrate Appium 1.x? | Remove (return warn result instead) |
| `check_environment` | connect device? | Remove (return fail result instead) |
| `start_appium_session` | app/noReset | Fix ordering (Issue 4) |
| `upgrade_project` | keep/overwrite paths | Remove (paths never overwritten anyway) |

---

## Summary of All Issues

| # | Tool | Severity | Status | Description |
|---|------|----------|--------|-------------|
| 1 | `start_appium_session` | 🔴 Critical | ✅ Fixed by dev | Appium v3 `/wd/hub` path hardcoded |
| 2 | `start_appium_session` | 🔴 Critical | ✅ Fixed by dev | `noReset:false` → 35s install → MCP timeout |
| 3 | `upgrade_project` | 🟡 High | ⚠️ Locally patched | `Questioner.clarify()` blocks upgrade forever |
| 4 | `start_appium_session` | 🔴 Critical | ❌ New | noReset override AFTER resolveCapabilities → still blocks iOS bundleId users |
| 5 | `check_environment` | 🟡 High | ❌ New | Appium 1.x detection blocks entire env report |
| 6 | `check_environment` | 🟡 High | ❌ New | No Android device → fail result is dead code, env report blocked |
| 7 | `run_cucumber_test` | 🟡 High | ❌ New | No `executionCommand` → CLARIFICATION_REQUIRED with no answer mechanism |
| 8 | `inject_app_build` | 🟡 Medium | ❌ New | File-not-found → CLARIFICATION_REQUIRED with no answer mechanism |

---

## Files Requiring Changes

| File | Issues | Action |
|------|--------|--------|
| `src/services/AppiumSessionService.ts` | 4 | Move noReset pre-patch before resolveCapabilities() |
| `src/services/ProjectMaintenanceService.ts` | 3 | Replace Questioner.clarify() with log notice |
| `src/services/EnvironmentCheckService.ts` | 5, 6 | Remove Questioner.clarify() calls; return warn/fail results directly |
| `src/services/ExecutionService.ts` | 7 | Default to wdio.conf.ts or throw clear error |
| `src/services/McpConfigService.ts` | 8 | Add `forceWrite` param, log warning instead of blocking |
| `src/index.ts` | 8 | Add `forceWrite` to `inject_app_build` schema |