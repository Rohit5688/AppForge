# AppForge — Implementation Task Queue

Each file in this folder is a **self-contained task** for a single fresh chat session.
A new AI session needs ONLY the task file + the source files listed inside it.
**No prior conversation history required.**

---

## How to Start a New Chat Session for Any Task

Paste this as your opening message in a new chat:

```
Read the task file at:
c:\Users\Rohit\mcp\AppForge\docs\issue\tasks\TASK-XX-name.md

Follow the instructions exactly. Make only the changes described.
Run npm run build in c:\Users\Rohit\mcp\AppForge after making changes.
Mark the task DONE when the build passes.
```

Replace `TASK-XX-name` with the actual filename.

---

## Execution Order

Tasks are grouped by priority tier. **Complete all tasks in a tier before moving to the next.**

### 🔴 TIER 1 — Security (Do First — Blocks Everything Else)

| # | Task File | What It Fixes | Files Changed | Effort |
|:--|:----------|:--------------|:--------------|:-------|
| **9** | `TASK-09-sandbox-security.md` | Sandbox `readFile` path traversal + `Promise` prototype escape | `SandboxEngine.ts`, `index.ts` | Small |
| **10** | `TASK-10-env-service-shell-fix.md` | `EnvironmentCheckService` uses `exec(string)` — replace with `execFile` + JSON.parse crash fix | `EnvironmentCheckService.ts` | Small |

> ⚠️ TASK-09 and TASK-10 can be done in any order. Both must be DONE before TIER 2.

---

### 🟡 TIER 2 — High-Priority Correctness (Do Before Releasing to Users)

| # | Task File | What It Fixes | Files Changed | Effort |
|:--|:----------|:--------------|:--------------|:-------|
| **11** | `TASK-11-config-deep-merge.md` | `manage_config` write destroys nested capability profiles (shallow merge bug) | `McpConfigService.ts` | Small |
| **12** | `TASK-12-config-read-sideeffects.md` | `configService.read()` mutates disk on every call + defaults permanently written | `McpConfigService.ts` | Small |
| **13** | `TASK-13-ios-questioner-fix.md` | `start_appium_session` iOS bundleId Questioner loop not fully fixed | `AppiumSessionService.ts` | Small |
| **14** | `TASK-14-ci-workflow-and-selfheal-fix.md` | `generate_ci_workflow` no projectRoot guard + `self_heal_test` resource-id missing `id=` | `index.ts`, `SelfHealingService.ts` | Small |

> ⚠️ TASK-11 and TASK-12 both modify `McpConfigService.ts` — do them in separate chat sessions, **do not combine**.
Done till this
---

### 🟠 TIER 3 — Medium Priority (Polish Before Beta)

| # | Task File | What It Fixes | Files Changed | Effort |
|:--|:----------|:--------------|:--------------|:-------|
| **15** | `TASK-15-credential-service-fixes.md` | `manage_users` helper written to wrong dir + `set_credentials` no `.gitignore` guard | `CredentialService.ts` | Small |
| **16** | `TASK-16-staging-tsconfig-and-duration.md` | `validate_and_write` staging tsconfig has absolute paths (breaks CI) + `summarize_suite` duration threshold | `FileWriterService.ts`, `SummarySuiteService.ts` | Small |
| **17** | `TASK-17-dynamic-environments.md` | **NEW FEATURE**: User-configurable environment names + `currentEnvironment` key in `mcp-config.json`. Removes hardcoded "staging/prod" assumption across tools | `McpConfigService.ts`, `ProjectSetupService.ts`, `CredentialService.ts`, `index.ts`, `TestGenerationService.ts` | Medium |

> ⚠️ TASK-17 should be done AFTER TASK-11 (deep merge) and TASK-12 (read side-effects) to avoid re-introducing config bugs during the multi-file changes.

---

### 🟢 TIER 4 — Config Propagation (Wire Up New Config Features)

| # | Task File | What It Fixes | Files Changed | Effort |
|:--|:----------|:--------------|:--------------|:-------|
| **18** | `TASK-18-config-schema-expansion.md` | Adds timeouts, reporter, selfHeal, codegen sections to the `mcp-config.json` schema | `McpConfigService.ts`, `ProjectSetupService.ts` | Small |
| **19** | `TASK-19-codegen-config-propagation.md` | Wire `codegen` preferences into test generation prompt | `TestGenerationService.ts`, `index.ts` | Medium |
| **20** | `TASK-20-timeout-selfheal-reporting-config.md` | Wire timeouts, selfHeal logic, and reporter output to their tools from config rather than hardcoded magic numbers | `ProjectSetupService.ts`, `SelfHealService.ts`, `AppiumSessionService.ts`, `index.ts` | Small |

> ⚠️ TASK-18 must be done before 19 and 20.

---

### 🔵 TIER 5 — Setup Redesign (Two-Phase Config)

| # | Task File | What It Fixes | Files Changed | Effort |
|:--|:----------|:--------------|:--------------|:-------|
| **21** | `TASK-21-two-phase-setup.md` | `setup_project` asks for everything blindly — change to Phase 1 (template creation) and Phase 2 (config-aware scaffolding) | `ProjectSetupService.ts`, `index.ts` | Medium |
| **22** | `TASK-22-upgrade-incremental.md` | `upgrade_project` only restores base files — change to incremental feature application and config sync | `ProjectSetupService.ts`, `index.ts` | Medium |

> ⚠️ TASK-21 and TASK-22 depend on Tiers 2-4 being complete. Setup must be reliable.

---

### 🟣 TIER 6 — Live Session Redesign (Original Task Plan — Do After All Above)

| # | Task File | What It Fixes | Files Changed | Effort |
|:--|:----------|:--------------|:--------------|:-------|
| **1** | `TASK-01-snapshot-engine.md` | LLM gets 50k tokens of XML → replace with compact Accessibility Snapshot | `ExecutionService.ts` | Medium |
| **2** | `TASK-02-snapshot-schema.md` | Update tool schema + `DO NOT CALL` description guards | `index.ts` | Small |
| **3** | `TASK-03-step-hints-filter.md` | Native on-device query via stepHints (zero XML fetch) | `ExecutionService.ts`, `index.ts` | Medium |
| **4** | `TASK-04-known-screen-map.md` | Inject Known Screen map into prompt (skip inspect for known screens) | `TestGenerationService.ts` | Medium |
| **5** | `TASK-05-slim-session-start.md` | Remove wasted XML on session start + add nav shortcut hints | `AppiumSessionService.ts`, `index.ts` | Small |
| **6** | `TASK-06-xml-cache-selfheal.md` | XML cache so `self_heal_test` works when session is dead | `AppiumSessionService.ts`, `ExecutionService.ts`, `index.ts` | Medium |
| **7** | `TASK-07-workflow-recovery.md` | Add `onFailure` recovery branches to `workflow_guide` | `index.ts` | Small |
| **8** | `TASK-08-environment-apk-check.md` | APK ABI compatibility check in `check_environment` | `EnvironmentCheckService.ts` | Small |

> ⚠️ TASK-01 through TASK-08 must be done in order (each depends on the previous for the live session chain). TASK-08 depends on TASK-10 being done first.

---

### ⚪ TIER 7 — MCP SDK Modernization (Skills-Derived, Do When Resuming)

These tasks come from the `Skills/reference/node_mcp_server.md` guide and retrofit modern MCP SDK patterns into AppForge. Currently locked as **ON HOLD** while TestForge is frozen.

| # | Task File | What It Does | Files Changed | Effort |
|:--|:----------|:-------------|:--------------|:-------|
| **23** | `TASK-23-sdk-migration-register-tool.md` | Migrate all tools from deprecated `setRequestHandler` to `server.registerTool()`. Unblocks annotations + outputSchema | `src/index.ts` | Large |
| **24** | `TASK-24-tool-annotations-structured-content.md` | Add `readOnlyHint/destructiveHint` annotations + `structuredContent` to JSON-returning tools | `src/index.ts` | Small |
| **25** | `TASK-25-character-limit-truncation.md` | Add 25k `CHARACTER_LIMIT` truncation to 5 large-output tools to prevent context flooding | `src/index.ts` | Small |
| **26** | `TASK-26-evaluation-harness.md` | Create `evaluation.xml` with 10 QA pairs + run baseline accuracy score | `docs/evaluation/` | Medium |

> 🔗 TASK-24 and TASK-25 depend on TASK-23 (need `registerTool` pattern first).
> TASK-26 is independent — can be done anytime after Tier 1.

## What Each Task Fixes (User-Facing Impact)

| Task | Problem Fixed |
|:-----|:--------------|
| 9 | Sandbox scripts could read `/etc/passwd` or escape via prototype chain |
| 10 | `check_environment` used shell-invoking `exec()` — injection risk + JSON crash on Appium output |
| 11 | Writing one capability key silently deleted all other device profiles |
| 12 | Every read-only tool call was secretly mutating `mcp-config.json` on disk |
| 13 | iOS `start_appium_session` always triggered a `CLARIFICATION_REQUIRED` loop |
| 14 | CI workflow could write outside project dir; self_heal always returned invalid selectors |
| 15 | `getUser.ts` written to wrong directory; BrowserStack API keys committed to Git |
| 16 | `validate_and_write` failed on CI due to absolute dev-machine paths in tsconfig |
| 17 | **[NEW FEATURE]** Tools hardcoded "staging/prod" — now reads environment list from `mcp-config.json`; `currentEnvironment` key tells all tools and the LLM which env-specific files to read/write |
| 18 | `mcp-config.json` lacked control over timeouts, reporting, codegen — expanded schema and `McpConfigService` |
| 19 | `generate_cucumber_pom` ignored user structure — now respects BasePage strategy, tags, and naming convention from config |
| 20 | Timeouts, Appium Ports, max retries were hardcoded — now dynamically read from config by tools and scaffold |
| 21 | `setup_project` forced 1-shot setup — split into config-first template creation and config-guided scaffolding |
| 22 | `upgrade_project` ignored newly added config — now incrementally scaffolds credentials/reporters on demand |
| 1+2 | LLM gets 50k tokens of XML → context floods → generation fails |
| 3 | stepHints run native on-device query → zero XML transferred |
| 4 | Known screens re-inspected even though Page Objects exist → context full |
| 5 | Session startup wastes one XML fetch |
| 6 | `self_heal_test` unusable when session dies after test failure |
| 7 | `workflow_guide` has no recovery when a step fails → LLM loops |
| 8 | `check_environment` says "ready" but APK wrong architecture → session fails |
| 23 | All tools registered with deprecated SDK API — no per-tool annotations, no `structuredContent`, no `outputSchema` |
| 24 | LLM clients cannot cache read-only tools or know which tools are destructive without annotations |
| 25 | Large `inspect_ui_hierarchy`, `run_cucumber_test`, `analyze_codebase` responses flood and truncate LLM context |
| 26 | No way to measure whether Claude can actually use AppForge tools accurately on real tasks |

---

## Rules for Each Task Session

1. **Read the full task file first** before touching any code
2. **grep or view** only the specific lines mentioned — do not read entire files unnecessarily
3. **Make ONLY the changes described** — nothing extra
4. Run `npm run build` in `c:\Users\Rohit\mcp\AppForge` after each task
5. Mark `Status: TODO` → `Status: DONE` in the task file when complete

---

## Project Info

- **Root**: `c:\Users\Rohit\mcp\AppForge`
- **Build**: `npm run build`
- **Key files**: `src/index.ts`, `src/services/ExecutionService.ts`, `src/services/AppiumSessionService.ts`, `src/services/McpConfigService.ts`, `src/services/SandboxEngine.ts`
