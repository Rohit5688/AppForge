# 🔴 Issue: Live Session Tool — Critical Redesign Required

> **Status**: Planning Phase  
> **Priority**: P0 — Blocks Production Readiness  
> **Scope**: `start_appium_session`, `inspect_ui_hierarchy`, `verify_selector`, `end_appium_session`, `analyze_codebase`

---

## 1. Problem Statement

The current live-session toolchain is **not production-ready**. The architecture was designed for ideal conditions (fast emulators, small UIs, short sessions) and fails under real-world usage patterns. Below is a full breakdown of every known critical issue.

---

## 2. Issue Register

### 🔴 ISSUE-01 — Brittle Appium Connection
**Tool:** `start_appium_session`
**Description:** The session establishment is fragile. Intermittent failures occur when Appium server isn't warm, device is recovering, or there is a port conflict from a previous session. There is no retry strategy or graceful session recycling.
**Root Cause:** Single-shot connection attempt with no pre-flight ping to the Appium server. No check for orphaned sessions from prior runs.
**Impact:** Dev wastes time restarting tools before any work can begin.

---

### 🔴 ISSUE-02 — Hard-Coded, Insufficient Timeout
**Tool:** `start_appium_session`, `inspect_ui_hierarchy`
**Description:** The tool uses a static timeout window that is too small for slow emulators/simulators (especially on first boot or when an app relaunches).
**Root Cause:** Timeouts are hardcoded constants with no capability to adapt to device response time. iOS simulators in CI environments can take 60–120 seconds to reach a stable state.
**Impact:** Tool fails on valid environments that are simply warm-up-slow, generating false error signals.

---

### 🔴 ISSUE-03 — Context Explosion from Large UI Hierarchies
**Tool:** `inspect_ui_hierarchy`
**Description:** When screens have a large number of elements (e.g., a list view, complex form, or nested navigation), the raw XML dump passed to the LLM context exceeds the practical processing capacity. **Cline's 128k context limit** means any large page causes immediate LLM hallucination.
**Root Cause:** The tool dumps the *entire* raw UI XML into the LLM context with no filtering or reduction strategy. A single complex screen can generate 50,000–100,000 tokens of XML.
**Impact:** This is the single most critical failure mode. LLM silently hallucinates locators that look real but don't exist.

---

### 🔴 ISSUE-04 — Weak Vision / OCR Quality
**Tool:** `inspect_ui_hierarchy` (with screenshot)
**Description:** The visual layer (screenshot) provides limited additional value because the VLM cannot reliably map visual positions of elements to XML node IDs at a granular level. The "eyes" of the system are not accurate enough to be a reliable primary source of locators.
**Root Cause:** Screenshots are passed as full-resolution images. Without a coordinate-to-node mapping overlay, the LLM must guess correlations between visual layout and XML structure. This is inherently unreliable.
**Impact:** Hybrid (XML + Vision) analysis promises more than it delivers, creating false confidence in generated locators.

---

### 🔴 ISSUE-05 — Appium Traffic Pressure on Emulator
**Tool:** `start_appium_session`, `inspect_ui_hierarchy`
**Description:** Maintaining a persistent Appium session adds constant IPC overhead to the emulator/simulator process. Frequent `getPageSource()` calls cause CPU spikes, UI jank, and in some cases, the emulator itself slows down or crashes.
**Root Cause:** Appium communicates via the WebDriver protocol, which is heavyweight for the purpose of simply reading a page source. Every roundtrip involves JSON serialization, HTTP, and Appium server processing.
**Impact:** Flaky tests due to a degraded test environment caused by the inspection tool itself.

---

### 🟡 ISSUE-06 — No Lightweight Alternative for Context-Constrained Environments
**Tool:** All live-session tools.
**Description:** There is no "lite mode" for the inspection. It's all-or-nothing: either a full Appium session with full XML dump, or nothing. For most use-cases (simple locator lookup, quick generation), a fraction of this data would suffice.
**Root Cause:** Architectural assumption that "more data = better accuracy", which fails for LLM-constrained environments.
**Impact:** Token wastage, hallucination risk, high cost per call.

---

### 🟡 ISSUE-07 — Codebase Analyzer Incorrect File Identification
**Tool:** `analyze_codebase`
**Description:** The analyzer fails to correctly identify project files in non-standard directory layouts. It incorrectly classifies files or misses them entirely, leading to incorrect "existing steps" and "existing pages" output.
**Root Cause:** File discovery relies on deterministic glob patterns (e.g., `src/features/**`) that don't account for custom project structures or monorepo setups.
**Impact:** LLM generates duplicate step definitions and new Page Objects for elements that already exist.

---

### 🟡 ISSUE-08 — File Creation Failures (Utils & Scaffolded Files)
**Tool:** `validate_and_write`
**Description:** When the LLM suggests creating utility files or helper classes, they are either not created at all, created with incomplete content, or created in the wrong location.
**Root Cause:** The write execution depends on a validated path resolution step that can fail silently, particularly when the suggested file path is relative and the project root is not anchored correctly.
**Impact:** Generated code references utilities that don't exist, causing runtime failures.

---

### 🟡 ISSUE-09 — Silent Fallback on Tool Failure
**Tool:** All tools with session dependency.
**Description:** When a session-dependent tool fails (e.g., `inspect_ui_hierarchy` when no session is active), the LLM immediately pivots to a fallback strategy without surfacing the error clearly. This causes confusing, unpredictable behavior.
**Root Cause:** Tools return generic error messages that the LLM interprets as a soft failure, triggering its "try another way" heuristic instead of stopping and alerting the user.
**Impact:** User loses trust. Hours of debugging arise from silent, incorrect fallback behavior.

---

### 🔴 ISSUE-10 — Overall Tool Readiness
**Summary:** The live-session toolchain, as it currently stands, is **not ready for general use**. The combination of reliability (ISSUE-01, 02), accuracy (ISSUE-03, 04), performance (ISSUE-05), and scaffolding quality (ISSUE-07, 08, 09) issues makes it unsuitable for a production QA workflow.

---

## 3. Proposed Solution Architecture

### Core Strategy: **"Thin Transport, Smart Filter"**
The fundamental redesign philosophy is: **move intelligence to the client (agent) side, reduce raw data sent to the LLM**.

---

### Solution A: Hierarchical XML Compression (ISSUE-03 Critical Fix)
Instead of dumping raw XML, implement a multi-pass reduction pipeline:

```
Raw XML (50k tokens)
    ↓ Pass 1: Remove non-interactive elements (static text, containers)
    ↓ Pass 2: Collapse deeply nested nodes without accessibility IDs
    ↓ Pass 3: Summarize repeating patterns (e.g., "12 ListView items with same structure")
    ↓ Pass 4: Rank elements by page prominence (clickable > visible > hidden)
Compressed Hierarchy (< 2k tokens)
```
**Target Output size**: Under 2,000 tokens for 95% of screens.

---

### Solution B: Targeted Element Query (ISSUE-03, ISSUE-05)
Instead of always returning the full hierarchy, expose a **query mode**:
- `inspect_ui_hierarchy(query: "login button")` → Returns only the top-3 matching nodes.
- This executes server-side via XPath/accessibility ID pre-filtering before sending to LLM.
- Drastically reduces tokens and Appium roundtrips.

---

### Solution C: Pre-Flight Warm-Up & Adaptive Timeout (ISSUE-01, ISSUE-02)
- Implement a **readiness check** before declaring session established: ping Appium with a lightweight health endpoint.
- Kill orphaned sessions on startup (check existing session IDs).
- Switch to **adaptive timeout**: start with a short poll interval (2s) and progressively back off up to a configurable max (default: 90s).

---

### Solution D: Structured Error with Halt Directive (ISSUE-09)
- All tool failures must return an `AppForgeError` with `sessionRequired: true` flag.
- The description instructs the LLM: *"Do not attempt a fallback. Surface this error to the user directly."*
- This prevents silent fallback chains.

---

### Solution E: Robust File Anchoring (ISSUE-08)
- The `validate_and_write` tool must resolve all relative paths against the `projectRoot` from `mcp-config.json`.
- Implement a **dry-run pre-check**: verify the resolved path is writable before attempting generation.
- Add an existence check: if the file already exists, prompt with a diff rather than overwriting.

---

### Solution F: Config-Driven Glob Patterns (ISSUE-07)
- `mcp-config.json` must expose a `projectLayout` key allowing custom glob overrides.
- The analyzer must fall back to heuristic discovery (scan all `.ts` files, classify by AST node type) when standard paths are absent.

---

### Solution G: Lightweight "Offline Inspection" Mode (ISSUE-06)
Introduce a **static analysis mode** that works without Appium:
- Developer runs `adb shell uiautomator dump` manually → saves `window_dump.xml` to project root.
- `inspect_ui_hierarchy(xmlDump: "./window_dump.xml")` parses this offline with zero Appium pressure.
- **Benefits**: No Appium session, no device pressure, no timeout risk — just XML compression + LLM.

---

## 4. Phased Implementation Plan

| Phase | Items | Goal |
| :--- | :--- | :--- |
| **Phase 1** (Critical) | ISSUE-01, 02, 03, 09 | Make the tool reliable enough to not actively mislead. |
| **Phase 2** (Quality) | ISSUE-04, 05, 06 | Reduce resource pressure and improve locator accuracy. |
| **Phase 3** (Completeness) | ISSUE-07, 08, 10 | Ensure the full scaffolding pipeline works end-to-end. |

---

## 5. Open Questions for Design Review

> [!IMPORTANT]
> **Q1**: For the XML compression pipeline (Solution A), should this run inside the MCP server (TypeScript) or should it be delegated to a sandbox script?

> [!IMPORTANT]
> **Q2**: For the Offline Inspection Mode (Solution G), should `adb dump` be invoked automatically by the tool or is a manual pre-step acceptable to reduce tool complexity?

> [!WARNING]
> **Q3**: The `inspect_ui_hierarchy` tool currently returns raw base64 screenshots. Given ISSUE-04 (weak vision), should we **deprecate** the screenshot return entirely in Phase 1 and rely solely on the compressed XML?

> [!NOTE]
> **Q4**: For ISSUE-07 (analyzer), do we want to expose a `projectLayout` config in `mcp-config.json` now, or use heuristic fallback as the sole discovery strategy?

---

## 6. Decision Log

| Date | Decision | Rationale |
| :--- | :--- | :--- |
| 2026-04-03 | Live session tools marked as NOT READY | Confirmed by user. 10 critical/major issues identified. |
| 2026-04-03 | Planning-first approach adopted | Need thorough architectural review before any code changes. |
