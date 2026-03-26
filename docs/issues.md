# LLM Context Hardening Plan

**Date**: 2026-03-27
**Branch**: `feature/token-optimization`

This plan isolates the issues that cause AppForge MCP responses to consume too much LLM context during live Appium workflows.

## Scope

Focus areas:
- Prevent `perform_action` from pushing raw XML/Base64 into the model context.
- Ensure the LLM is guided toward the compact, correct locator-discovery flow.
- Return semantic screen summaries instead of raw launch-screen payloads.
- Add missing pre-flight checks that reduce avoidable retry loops and wasted context.

## Status Summary

| ID | Issue | Severity | Status |
|----|-------|----------|--------|
| LS-07 | `perform_action` returns full raw XML + Base64 screenshot every step — exhausts AI context budget mid-flow | P0 | ✅ Fixed — compact default, LS-11/12 prevent verbosity |
| LS-11 | `verboseCapture` flag exposed in `perform_action` schema — LLM correctly sends it for any locator-capture task, defeating compact default | P0 | ✅ Fixed — removed from schema |
| LS-12 | `inspect_ui_hierarchy` schema has `required: ["xmlDump"]` — LLM cannot discover no-arg live-fetch path; falls back to verbose `perform_action` | P0 | ✅ Fixed — made optional, description rewritten |
| LS-13 | `run_cucumber_test` returns raw WDIO output and inlines failure screenshot/XML — failed or timed-out runs can exhaust 128K context | P0 | ✅ Fixed — compact response, artifact paths |
| LS-14 | Generated projects fail to run tests with `require() cannot be used on ESM graph with top-level await` — scaffolding doesn't configure ts-node ESM | P1 | ✅ Fixed — ts-node ESM config added |
| LS-15 | `validate_and_write` always fails with `error TS5042: Option 'project' cannot be mixed with source files on a command line` when project has a `tsconfig.json` | P0 | ✅ Fixed — temporary scoped tsconfig used for validation |
| LS-16 | `train_on_example` crashes with `Cannot read properties of undefined (reading 'toLowerCase')` — prevents team from persisting learned patterns to `.appium-mcp/mcp-learning.json` | P1 | ✅ Fixed — input validation & defensive null checks added

## Delivery Order

| Priority | ID | Work item | File(s) |
|----------|----|-----------|---------|
| P0 | LS-13 | Compact `run_cucumber_test` response; persist raw logs/XML/screenshot as artifacts instead of returning them inline | `src/services/ExecutionService.ts`, `src/index.ts` |
| P0 | LS-11 | Remove `verboseCapture` from `perform_action` schema; update description to redirect locator work to `inspect_ui_hierarchy` | `src/index.ts` |
| P0 | LS-12 | Remove `xmlDump` from `inspect_ui_hierarchy` required array; rewrite description to lead with no-arg live usage | `src/index.ts` |
| P0 | LS-09 | Return `topElements` in `start_appium_session` response | `src/services/AppiumSessionService.ts`, `src/index.ts` |
| P1 | LS-10 | Replace raw `pageSource` drop with semantic `topElements` in session start | `src/index.ts` |
| P1 | LS-14 | Configure ts-node ESM in scaffolded projects to prevent module resolution errors | `src/services/ProjectSetupService.ts` |
| P1 | LS-02 | Add driver-presence check to `check_environment` | `src/services/EnvironmentCheckService.ts` |
| P0 | LS-15 | Fix `validate_and_write` TS5042 — use temporary scoped tsconfig instead of mixing `--project` with file paths | `src/services/FileWriterService.ts` |
| P1 | LS-16 | Fix `train_on_example` crash by adding input validation and null checks in LearningService | `src/services/LearningService.ts` |

## Issue Notes

### LS-07

`perform_action` still carries a context-risk even after compact-mode support was added, because the LLM can be pushed onto the verbose path by tool-schema wording. This issue is only fully resolved when LS-11 and LS-12 are fixed and the LLM consistently uses compact navigation plus no-arg hierarchy inspection.

**✅ Fixed (Already on branch):**
- `src/services/ExecutionService.ts`: Response type includes `verboseCapture` flag that defaults to `false`
- When `verboseCapture` is false (default), full XML/Base64 are **never** included in response
- Response contains only: element count, screen title, top 5 interactive elements with selectors
- Uses `compactOutput()` helper to truncate logs to safe size (~1-2 KB)
- Fixed fully by LS-11 and LS-12 preventing LLM from ever setting `verboseCapture: true`

### LS-11

The `perform_action` schema previously exposed `verboseCapture` for locator work, which made the LLM send it for any locator-capture task.

**✅ Fixed in `src/index.ts`:**
- **Removed** entire `verboseCapture` property from `perform_action` inputSchema
- Updated `perform_action` description to include: "For full locator inspection after navigating to a new screen, call `inspect_ui_hierarchy` with no arguments."
- Now LLM cannot send `verboseCapture: true` because the parameter doesn't exist in schema
- All locator inspection requests automatically redirect to the compact `inspect_ui_hierarchy` tool

### LS-12

The `inspect_ui_hierarchy` schema previously declared `xmlDump` as required, which prevented the LLM from calling it in live-session mode with no arguments.

**✅ Fixed in `src/index.ts`:**
- **Removed** `xmlDump` from `inspect_ui_hierarchy` `required` array (was `required: ["xmlDump"]`, now `required: []`)
- Rewrote tool description to lead with: "Call with NO arguments when a session is active — live XML is fetched automatically."
- Made behavior explicit: "Optionally pass xmlDump to analyse a previously captured hierarchy"
- Now LLM can call `inspect_ui_hierarchy()` with zero arguments in live sessions
- Live mode automatically fetches current screen XML without needing parameter

### LS-13

`run_cucumber_test` was returning too much data inline, which could exhaust a 128K model context during a single failed or retried scenario run.

**✅ Fixed in `src/services/ExecutionService.ts` and `src/index.ts`:**

*Response Interface Changes:*
- Added `outputArtifactPath: string` — full WDIO log location on disk
- Added `outputTruncated: boolean` — indicates if response was truncated
- Added `timedOut: boolean` — explicit timeout flag
- Added `exitCode: number` — process exit code

*Implementation in ExecutionService:*
- Implemented `compactOutput(logs: string, maxLines: number, maxBytes: number)` helper
- Truncates full WDIO output to last 40 lines or 8 KB, whichever is smaller
- Returns `{ truncated, output }`
- Implemented `writeOutputArtifact(projectRoot, tag, output)` to persist full logs to disk
- Writes to `.../reports/appforge/run-{timestamp}.log`
- Returns artifact path for LLM reference
- Implemented `writeFailureArtifacts()` for test failures
- Persists screenshot (no inline Base64) to artifact file
- Persists page source XML to artifact file
- Returns paths to both
- Modified response payload to include `pageSummary` in-band:
- Element count, screen title, top 5 elements with selectors
- Much smaller than raw XML (~100 bytes vs. 100+ KB)

*Result:*
- Response size: ~1-2 KB for typical test runs (was 100+ KB)
- Full logs available to user via artifact paths
- LLM gets semantic summary to reason about test results without re-reading huge payloads

### LS-14

Generated projects were failing with `require() cannot be used on ESM graph with top-level await`.

**Root cause:**
- `package.json` was scaffolded with `"type": "module"` (full ESM mode)
- `tsconfig.json` had no ts-node ESM configuration
- `cucumber.js` used CommonJS `ts-node/register` instead of ESM module loader
- `wdio` config files had TypeScript import resolution issues

**✅ Fixed in `src/services/ProjectSetupService.ts`:**

*In `scaffoldTsConfig()` method:*
- Added ts-node ESM configuration block to generated `tsconfig.json`:
```json
"ts": {
"node": {
"esm": true,
"experimentalEsm": true
}
}
```
- This enables ts-node to understand top-level await in ESM modules
- Placed at root level of tsconfig alongside `compilerOptions`

*In `scaffoldCucumberConfig()` method:*
- Changed `requireModule` from `['ts-node/register']` to `['ts-node/esm']`
- This tells Cucumber to use ts-node's ESM loader instead of CommonJS register hook
- ESM loader properly handles `.ts` file imports in feature file hooks

*In `scaffoldWdioAndroidConfig()` and `scaffoldWdioIosConfig()` methods:*
- Kept `.ts` extensions in imported config files (e.g., `from './wdio.shared.conf.ts'`)
- ts-node now correctly resolves TypeScript imports without compilation errors

**Applied to Test Project:**
- Manually applied LS-14 fixes to `/Users/rsakhawalkar/testAppForge`:
- Updated `tsconfig.json` with ts-node ESM block
- Updated `cucumber.js` to use `ts-node/esm`
- Updated `wdio.ios.conf.ts` and `wdio.android.conf.ts` imports to use `.ts` extensions
- Test project now runs Cucumber tests without ESM/require resolution errors

### LS-15

`validate_and_write` was failing with `error TS5042: Option 'project' cannot be mixed with source files on a command line` on every project that has a `tsconfig.json`.

**Root cause:**
`validateTypeScript()` in `FileWriterService` was building the tsc command as:
```
npx tsc --noEmit --project tsconfig.json file1.ts file2.ts
```
TypeScript's CLI explicitly bans mixing `--project` with explicit file arguments. This made `validate_and_write` completely unusable on any real project.

**✅ Fixed in `src/services/FileWriterService.ts` `validateTypeScript()` method:**

*For projects with tsconfig.json:*
- Create temporary `tsconfig.validate.json` in the staging directory
- Write scoped tsconfig that `extends` the project's tsconfig:
```json
{
"extends": "../tsconfig.json",
"compilerOptions": { /* inherit from parent */ },
"include": ["file1.ts", "file2.ts", ...]
}
```
- Run `tsc --project tsconfig.validate.json` with **no file arguments**
- This is fully compliant with tsc CLI rules: `--project` alone is allowed
- Scoped include list limits validation to only staged files

*For projects without tsconfig.json:*
- Pass file paths directly to tsc without `--project` flag (unchanged behavior)
- Falls back to default TypeScript configuration

*Result:*
- All validation now passes TS5042 check
- `validate_and_write` works on any real project with or without tsconfig
- Temporary files cleaned up after validation completes

### LS-16

`train_on_example` tool crashes when attempting to persist team-learned patterns from live test sessions.

**Error observed:**
```
Error: {
"code": "TOOL_EXECUTION_ERROR",
"message": "Cannot read properties of undefined (reading 'toLowerCase')",
"tool": "train_on_example"
}
```

**Root cause:**
The `LearningService.learn()` method performs input validation on `pattern.length` and `solution.length`, but doesn't validate that these parameters are actually strings before use. If undefined/null is passed, `.length` access fails. Additionally, in `matchesConditions()`, the code calls `.toLowerCase()` on keyword array elements (`keywordsAll`, `keywordsAny`) without checking if the array items are strings.

**✅ Fixed in `src/services/LearningService.ts`:**

*In `learn()` method — Comprehensive Input Validation:*
- Added checks that `pattern` and `solution` are non-empty strings
- Added check that `tags` is an array (not undefined or null)
- Loop through tags array and verify each element is a string
- Validate entire `conditions` object structure:
- `conditions.toolNames` must be array (if provided)
- `conditions.platforms` must be array (if provided)
- `conditions.keywordsAll`, `keywordsAny`, `tagsAny` must all be arrays
- Loop through each array and verify all elements are strings
- All validation failures throw descriptive error messages:
```
'Rule pattern is required and must be a string.'
'Tag must be a string, got [type]: [value]'
'platform must be string, got [type]'
```

*In `matchesConditions()` method — Defensive Null Checks:*
- Before calling `.toLowerCase()` on `keywordsAll` elements:
```typescript
const allMatch = rule.conditions.keywordsAll.every(kw => {
if (typeof kw !== 'string') return false; // Added check
return text.includes(kw.toLowerCase());
});
```
- Before calling `.toLowerCase()` on `keywordsAny` elements:
```typescript
const anyMatch = rule.conditions.keywordsAny.some(kw => {
if (typeof kw !== 'string') return false; // Added check
return text.includes(kw.toLowerCase());
});
```

*In `normalize()` helper:*
- Added defensive check at start:
```typescript
if (!s || typeof s !== 'string') return '';
```
- Now safely handles null/undefined input instead of crashing

*Result:*
- All input fields validated before any `.toLowerCase()` or array operations
- Clear error messages help users fix their tool calls
- No more undefined property access errors
- Build verified clean (no TypeScript errors)

### LS-02 — No Preflight Check for Missing Appium Drivers

Session startup still discovers missing Appium drivers too late. This increases retries, error output, and wasted context.

**Planned fix:**
- Run `appium driver list --installed` during `check_environment`.
- Cross-check required driver by platform.
- Return the exact install command when missing.

## Acceptance Criteria

- LLM never sends `verboseCapture: true` unprompted on a locator-capture workflow.
- `inspect_ui_hierarchy` is called with no arguments when a session is active.
- `inspect_ui_hierarchy` with no arguments returns live current-screen XML when a session is active.
- `run_cucumber_test` inline response stays compact for passing, failing, and timed-out runs.
- Raw WDIO logs, XML, and screenshots are returned only as artifact paths, never inline in the tool response.
- `perform_action` responses remain compact during multi-step flows.
- `start_appium_session` returns real element labels and selectors from the launch screen.
- `check_environment` warns when the required Appium driver is not installed and provides the exact install command.
- Generated projects can run `run_cucumber_test` without ESM/require resolution errors.
