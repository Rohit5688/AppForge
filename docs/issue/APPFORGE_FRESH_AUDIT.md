# AppForge — Fresh Source Code Audit (April 2026)

> **Scope**: All issues discovered by reading the current source code directly, **after** Sessions 1–3 and the live_session_redesign plan were already written.  
> All `TASK-01` through `TASK-08` are still `TODO` (not implemented).  
> This document only covers issues **not already tracked** in prior session docs.

---

## AUDIT-01 — `manage_config` (write) Uses Shallow Merge — Nested Config Keys Silently Deleted

**Tool**: `manage_config` (write)  
**Severity**: 🟡 HIGH  
**File**: `src/services/McpConfigService.ts` (line ~126)

### Root Cause
```typescript
const newConfig = { ...existingConfig, ...config };  // BROKEN
```
`...spread` is a **shallow merge**. If a caller writes only `{ mobile: { defaultPlatform: 'ios' } }`, the entire existing `mobile.capabilitiesProfiles` object is **replaced** because the top-level `mobile` key is overwritten.

The tool description says *"only keys you provide are updated, all others are preserved"* — this is false for any nested object.

### Impact
- Writing a single capability silently deletes all other capability profiles.
- Was marked "fixed" in Session 3 (Issue #8) but `deepMerge()` was never actually implemented.

### Fix
```typescript
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key] ?? {}, source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}
```

---

## AUDIT-02 — `McpConfigService.read()` Mutates Disk on Every Read (Side-Effectful)

**Tool**: Any tool that calls `configService.read()`  
**Severity**: 🟠 MEDIUM  
**File**: `src/services/McpConfigService.ts` (lines ~68–74)

### Root Cause
```typescript
if (!raw.version || raw.version === '1.0.0') {
  raw.version = this.CURRENT_VERSION;
  this.write(projectRoot, raw);  // ← writes on every read if config is old
  this.generateSchema(projectRoot);
}
```
Every `configService.read()` invocation checks for an old version and silently **writes back to disk**. Tools like `check_environment`, `analyze_coverage`, and `audit_mobile_locators` call `read()` for a read-only check but silently mutate the user's config file.

### Impact
- Race condition if two tools run concurrently.
- All read operations corrupt `config.paths` (see AUDIT-16).

### Fix
Separate migration into a standalone `migrateIfNeeded()` called only from `setup_project` and `upgrade_project`. All other `read()` calls must be idempotent.

---

## AUDIT-03 — `start_appium_session` iOS Clarification Loop Not Fully Fixed

**Tool**: `start_appium_session`  
**Severity**: 🟡 HIGH  
**File**: `src/services/AppiumSessionService.ts` (lines ~282–296)

### Root Cause
The handler force-sets `noReset:true` before calling `resolveCapabilities()`. This avoids the first `Questioner.clarify()` (which fires when no `appium:app` is set). However, the **second Questioner call** (iOS bundleId check) still fires for iOS sessions without a `bundleId` even though `noReset` is now true.

### Impact
- iOS `start_appium_session` calls still trigger `CLARIFICATION_REQUIRED` loops.
- Reported as Issue #4 in the Production Readiness Review — marked as addressed but still present.

### Fix
Remove the iOS `bundleId` Questioner call. Log a warning and let Appium produce its own native error.

---

## AUDIT-04 — `EnvironmentCheckService` Uses `execAsync(string)` Throughout

**Tool**: `check_environment`  
**Severity**: 🔴 CRITICAL  
**File**: `src/services/EnvironmentCheckService.ts` (lines 1, 75, 119, 144, 158, 170)

### Root Cause
```typescript
const execAsync = promisify(exec);  // ← exec, NOT execFile

await execAsync('node --version');
await execAsync('appium driver list --installed --json');
await execAsync('adb devices');
await execAsync('xcodebuild -version');
await execAsync('xcrun simctl list devices booted --json');
```
This service was **never migrated to `execFile`**. The `projectRoot` parameter is also never validated with `validateProjectRoot()`, so a crafted path containing shell metacharacters can escape.

### Impact
- Shell injection via PATH hijacking.
- No `projectRoot` sanitization allows directory traversal side-effects.

### Fix
- Add `validateProjectRoot(projectRoot)` at the top of `check()`.
- Migrate all `execAsync(string)` calls to `execFileAsync('binary', [args])`.

---

## AUDIT-05 — `generate_ci_workflow` Writes File Without `projectRoot` Validation

**Tool**: `generate_ci_workflow`  
**Severity**: 🟡 HIGH  
**File**: `src/index.ts` (lines 675–681)

### Root Cause
```typescript
const fullPath = path.default.join(args.projectRoot, workflow.filename);
fs.default.mkdirSync(dir, { recursive: true });
fs.default.writeFileSync(fullPath, workflow.content);
```
`args.projectRoot` is never validated. A crafted `projectRoot` can write the workflow file outside the intended project directory.

### Fix
Add `validateProjectRoot(args.projectRoot)` before any filesystem operation (same guard as `FileWriterService`).

---

## AUDIT-06 — `execute_sandbox_code` `readFile` API Has No Path Traversal Guard

**Tool**: `execute_sandbox_code`  
**Severity**: 🟡 HIGH  
**File**: `src/index.ts` (lines 769–772)

### Root Cause
```typescript
readFile: async (filePath: string) => {
  return fs.default.readFileSync(filePath, 'utf8');  // ← no validation
},
```
A sandbox script can call `forge.api.readFile('/etc/passwd')` or `forge.api.readFile('C:\\Windows\\System32\\config\\SAM')`. This bypasses the `BLOCKED_PATTERNS` static checker because the malicious path is passed as a **data argument** to a legitimate API call, not as code.

### Fix
Require `projectRoot` alongside `filePath` and check the resolved path starts within the project root before reading.

---

## AUDIT-07 — Sandbox `Promise` Exposure Enables Prototype Chain Escape

**Tool**: `execute_sandbox_code`  
**Severity**: 🟡 HIGH  
**File**: `src/services/SandboxEngine.ts` (line ~207)

### Root Cause
```typescript
// Exposed to sandbox context:
Promise,
```
Exposing the live host `Promise` constructor allows a script to extract the host `Function` constructor via the prototype chain, bypassing the `Function: undefined` block:
```javascript
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
return await AsyncFunction('return process.env')();
```
The `BLOCKED_PATTERNS` regex does **not** block `Object.getPrototypeOf` or `AsyncFunction`.

### Fix
- Add `Object.getPrototypeOf` to `BLOCKED_PATTERNS` as an immediate patch.
- Longer term: migrate sandbox to `worker_threads` for true isolation.

---

## AUDIT-08 — `manage_users` Writes `getUser.ts` Helper to Hardcoded `utils/` Directory

**Tool**: `manage_users`  
**Severity**: 🟠 MEDIUM  
**File**: `src/services/CredentialService.ts` (lines 113, 147)

### Root Cause
```typescript
const utilsDirPath = path.join(projectRoot, 'utils');    // HARDCODED
const helperPath = path.join(projectRoot, 'utils', 'getUser.ts');  // HARDCODED
```
Despite the user data directory being resolved from `config.paths.testDataRoot`, the generated helper is always written to `<projectRoot>/utils/`. Projects using `src/utils/` will find the helper in the wrong location.

### Fix
Resolve the output path from `config.paths.utilsRoot` (or equivalent) instead of the hardcoded `utils/`.

---

## AUDIT-09 — `set_credentials` Writes Plain-Text Credentials Without `.gitignore` Guard

**Tool**: `set_credentials`  
**Severity**: 🟠 MEDIUM  
**File**: `src/services/CredentialService.ts` (lines 21–41)

### Root Cause
`setEnv()` writes credentials to `.env` with no check whether `.env` is listed in `.gitignore`. If the user's project doesn't have `.env` in `.gitignore`, calling `set_credentials` with BrowserStack/SauceLabs API keys will silently write them to a tracked file.

Additionally, credential values are not sanitized — a value containing `\n` would silently break the `.env` file format.

### Fix
- After writing `.env`, check if `.gitignore` exists and if `.env` is listed. If not, append it automatically and inform the user.
- Sanitize values to reject multi-line strings.

---

## AUDIT-10 — `self_heal_test` `resource-id` Candidates Missing `id=` Prefix

**Tool**: `self_heal_test`  
**Severity**: 🟠 MEDIUM  
**File**: `src/services/SelfHealingService.ts` (lines 272–273)

### Root Cause
```typescript
} else if (match[0].startsWith('resource-id')) {
  alternatives.push(value);   // ← missing "id=" prefix — always invalid
```
WebdriverIO requires `id=com.app:id/btnSubmit`. The raw `resource-id` value without `id=` is an invalid selector. `ExecutionService.parseXmlElements()` correctly builds `id=${resourceId}` but `SelfHealingService` is inconsistent.

### Fix
```typescript
alternatives.push(`id=${value}`);
```

---

## AUDIT-11 — `start_appium_session` Discards Screenshot and Parses Full XML Synchronously

**Tool**: `start_appium_session`  
**Severity**: 🟠 MEDIUM  
**File**: `src/index.ts` (lines 726–734), `src/services/AppiumSessionService.ts` (line 84)

### Root Cause
- `sessionInfo.screenshot` is taken but **never returned** in the handler response.
- `this.executionService['parseXmlElements'](sessionInfo.initialPageSource)` synchronously parses 15–50K token XML just to count elements on the critical startup path.

### Impact
- Users get no visual confirmation the session is on the right screen.
- Startup latency increases by ~100-500ms on complex screens.

### Fix
Return a compact response with element count + optionally return the screenshot. Defer XML parsing to first `inspect_ui_hierarchy` call.

---

## AUDIT-12 — `check_environment` Crashes on Non-JSON Appium Driver Output

**Tool**: `check_environment`  
**Severity**: 🟢 LOW  
**File**: `src/services/EnvironmentCheckService.ts` (lines 119–120)

### Root Cause
```typescript
const { stdout } = await execAsync('appium driver list --installed --json');
const drivers = JSON.parse(stdout);  // throws if stdout has non-JSON prefix
```
npm deprecation warnings or Appium startup logs printed before the JSON output cause `JSON.parse` to throw, propagating an unhandled exception instead of a graceful `warn` status.

### Fix
Wrap `JSON.parse` in try-catch; fall back to regex parsing or return a `warn` check result.

---

## AUDIT-13 — `summarize_suite` Duration Threshold Wrong for Very-Fast Tests

**Tool**: `summarize_suite`  
**Severity**: 🟢 LOW  
**File**: `src/services/SummarySuiteService.ts` (lines 82–84)

### Root Cause
```typescript
const durationSec = totalDurationNs > 10_000_000 
  ? Math.round(totalDurationNs / 1_000_000_000)  // nanoseconds
  : Math.round(totalDurationNs / 1_000);           // milliseconds
```
For a very fast test (< 10ms): duration in nanoseconds = `< 10,000,000`. The code incorrectly takes the millisecond branch, dividing by 1,000 instead of 1,000,000,000, and reports a duration **1,000,000× too large**. A 5ms test shows as 5,000 seconds.

### Fix
Use a reliable minimum threshold (e.g., 1,000,000,000 for 1 second) or detect the reporter format via Cucumber's `meta.implementation` field.

---

## AUDIT-14 — `workflow_guide` Has No `onFailure` Recovery Branches

**Tool**: `workflow_guide`  
**Severity**: 🟠 MEDIUM  
**File**: `src/index.ts` (lines 804–856)

### Root Cause
All 4 workflows describe the happy path only. When any step fails, the LLM has no guidance — it either loops or halts. This is TASK-07 which is still `TODO`.

### Fix
Add `onFailure` arrays to each step:
```json
{
  "step": "2. inspect_ui_hierarchy...",
  "onFailure": "No active session — return to step 1 (start_appium_session)."
}
```

---

## AUDIT-15 — `validate_and_write` Staging `tsconfig` Uses Absolute Paths

**Tool**: `validate_and_write`  
**Severity**: 🟠 MEDIUM  
**File**: `src/services/FileWriterService.ts` (lines 263–281)

### Root Cause
```typescript
const stagingTsconfig = {
  extends: tsconfigPath,              // absolute dev-machine path
  compilerOptions: {
    baseUrl: projectRoot,             // absolute dev-machine path
    rootDir: projectRoot,             // absolute dev-machine path
  },
  include: [
    path.join(stagingDir, '**/*.ts'), // absolute path
    path.join(projectRoot, '**/*.ts') // absolute path
  ],
};
```
On CI, the workspace path differs from the developer's machine. Absolute paths in the staging tsconfig cause tsc to fail with "path not found" errors on the CI agent.

Additionally, Windows paths contain backslashes which may not be valid inside `tsconfig.json`'s `extends` or `include` fields on some tsc versions.

### Fix
Use `path.relative()` for `extends` and normalize separators in all path values.

---

## AUDIT-16 — `McpConfigService` Permanently Writes `resolvePaths()` Defaults to Disk

**Tool**: Any tool that writes config after reading it  
**Severity**: 🟠 MEDIUM  
**File**: `src/services/McpConfigService.ts` (lines 77, 120–128)

### Root Cause
`read()` injects defaults via `resolvePaths()` into the returned object. `write()` then saves that object back to disk including all injected defaults. After one read-write cycle, the config file now contains explicit `paths.*` values that were never user-configured — they just look that way.

### Impact
- Config file grows with auto-injected fields on every cycle.
- Users can never return to default behavior; they must manually delete fields.

### Fix
In `write()`, strip path values that exactly match the defaults before persisting OR apply defaults only at point-of-use (not in `read()`).

---

## Summary Table

| # | Tool | Severity | Issue |
|---|------|----------|-------|
| AUDIT-01 | `manage_config` write | 🟡 HIGH | Shallow merge destroys nested config |
| AUDIT-02 | All tools | 🟠 MEDIUM | `read()` mutates disk on every call |
| AUDIT-03 | `start_appium_session` | 🟡 HIGH | iOS Questioner loop not fully fixed |
| AUDIT-04 | `check_environment` | 🔴 CRITICAL | `exec(string)` + no projectRoot validation |
| AUDIT-05 | `generate_ci_workflow` | 🟡 HIGH | File write without projectRoot validation |
| AUDIT-06 | `execute_sandbox_code` | 🟡 HIGH | `readFile` API reads arbitrary filesystem paths |
| AUDIT-07 | `execute_sandbox_code` | 🟡 HIGH | `Promise` in VM enables prototype chain escape |
| AUDIT-08 | `manage_users` | 🟠 MEDIUM | Helper written to hardcoded `utils/` dir |
| AUDIT-09 | `set_credentials` | 🟠 MEDIUM | No .gitignore guard for credentials |
| AUDIT-10 | `self_heal_test` | 🟠 MEDIUM | `resource-id` candidates missing `id=` prefix |
| AUDIT-11 | `start_appium_session` | 🟠 MEDIUM | Screenshot discarded; XML parsed on startup |
| AUDIT-12 | `check_environment` | 🟢 LOW | JSON.parse crash on non-JSON Appium output |
| AUDIT-13 | `summarize_suite` | 🟢 LOW | Duration threshold wrong for fast tests |
| AUDIT-14 | `workflow_guide` | 🟠 MEDIUM | No onFailure recovery branches (TASK-07 TODO) |
| AUDIT-15 | `validate_and_write` | 🟠 MEDIUM | Staging tsconfig has absolute paths — breaks CI |
| AUDIT-16 | `manage_config` | 🟠 MEDIUM | `resolvePaths()` defaults permanently written to disk |

---

## Priority Fix Order

### 🔴 Immediate (Security)
1. **AUDIT-04** — `check_environment` shell injection
2. **AUDIT-06** — Sandbox `readFile` reads any file on disk
3. **AUDIT-07** — Sandbox `Promise` prototype escape

### 🟡 Before Release
4. **AUDIT-01** — `manage_config` destroys capabilities on write
5. **AUDIT-03** — `start_appium_session` iOS clarification loop
6. **AUDIT-05** — `generate_ci_workflow` no projectRoot guard

### 🟠 Before Beta
7. **AUDIT-10** — `self_heal_test` broken resource-id format
8. **AUDIT-02** — Side-effectful `read()` mutations
9. **AUDIT-16** — Config defaults permanently written
10. **AUDIT-14** — `workflow_guide` no recovery branches
11. **AUDIT-15** — Staging tsconfig absolute paths break CI
12. **AUDIT-08** — Wrong helper directory for manage_users
13. **AUDIT-09** — No .gitignore guard for credentials
14. **AUDIT-11** — Screenshot discarded on session start

### 🟢 Polish
15. **AUDIT-12** — check_environment JSON.parse crash
16. **AUDIT-13** — summarize_suite duration threshold edge case
