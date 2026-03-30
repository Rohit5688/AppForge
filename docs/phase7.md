 Phase 7 Issues and Fix Plan

This document summarizes issues found during first-time end-user validation, with concrete fix plans and current status.

## Current Status Summary

### Fixed

- `P7-01` `start_appium_session` path mismatch
- `P7-02` JSON/XML parse noise — deduplication buffer added, compact error envelopes on all session failures
- `P7-03` Missing `mobile.capabilitiesProfiles` typed validation
- `P7-04` Malformed `mcp-config.json` typed parse errors
- `P7-05` `setup_project` atomic/path-safe scaffold
- `P7-06` `repair_project` recovery flow
- `P7-07` `end_appium_session` explicit lifecycle states
- `P7-08` `analyze_coverage` missing path diagnostics
- `P7-09` Error contract standardized across all tool paths, downstream Appium/WebdriverIO messages normalized and deduplicated
- `P7-10` Tool descriptions labeled `[PROMPT-BUILDER]`, `[ARTIFACT-WRITER]`, and `[EXECUTOR]` with canonical first-time onboarding flow documented

### Partially Fixed

_(none — all partial issues resolved)_

### Not Fixed Yet

_(none — Phase 7 complete)_

## Scope

- First-time onboarding reliability
- Runtime input safety
- Appium session startup robustness
- Error contract consistency
- Analysis diagnostics clarity

## Issue Matrix

| ID | Issue | Impact | Fix Plan | Status |
|---|---|---|---|---|
| P7-01 | `start_appium_session` path mismatch (`/wd/hub` vs `/`) | Session startup fails with `unknown command`/404 | Auto-detect Appium server path via `/status` and `/wd/hub/status`, then route WebdriverIO accordingly | Fixed |
| P7-02 | Repeated JSON parse noise (`Unexpected token '<'`, `Unexpected non-whitespace...`) during session failures | Confusing user output and hard triage | Keep failures in structured error envelopes, suppress excessive client logs, avoid parsing XML as JSON in tool flow | **Fixed** |
| P7-03 | Missing `mobile.capabilitiesProfiles` returned raw TypeError | Poor UX, unclear remediation | Validate config shape in `McpConfigService.read` and throw typed missing-field errors | Fixed |
| P7-04 | Malformed `mcp-config.json` gave low-context failures | Hard for users to self-correct | Return typed config parse errors with clear hinting | Fixed |
| P7-05 | `setup_project` partial scaffold risk | Broken first-run setup | Use atomic staging + commit, correct scaffold paths | Fixed |
| P7-06 | Recovery dead-end after interrupted setup | User blocked by safety checks | Add `repair_project` to regenerate missing baseline files safely | Fixed |
| P7-07 | `end_appium_session` ambiguous success | Misleading lifecycle status | Return explicit states: `no_active_session` and `terminated` | Fixed |
| P7-08 | `analyze_coverage` silently accepted invalid paths | False confidence in report | Add `missingPaths` and `pathWarning` diagnostics | Fixed |
| P7-09 | Non-uniform tool error shapes | Client integration complexity | Standardize on machine-readable error contract with `isError: true` | **Fixed** |
| P7-10 | Prompt-builder vs artifact-writer behavior ambiguity | Onboarding confusion | Clarify tool descriptions and add canonical generate->write flow docs | **Fixed** |

## Detailed Plans

### P7-01 Appium Server Path Compatibility

- Detect server mode using status probes.
- Support Appium 2 root path (`/`) and Appium 1 path (`/wd/hub/`).
- Enrich endpoint mismatch guidance in session errors.

### P7-02 JSON/XML Parse Noise Reduction

- Keep XML payload handling only in hierarchy inspection path.
- Prevent stdout noise from session startup internals where possible.
- Preserve structured MCP envelopes on all failures.

### P7-03 Config Shape Validation

- Validate required fields at config-read boundary:
- `mobile`
- `mobile.defaultPlatform`
- `mobile.capabilitiesProfiles`
- Return explicit missing-field errors (E003 family).

### P7-05 First-Run Setup Reliability

- Stage scaffold writes in temp directory.
- Commit atomically.
- Keep path model consistent (`src/pages`, `src/step-definitions`, `src/features`).

### P7-06 Recovery Workflow

- Provide `repair_project` to restore missing baseline files.
- Never overwrite existing user-owned files.
- Provide clear repair summary output.

### P7-10 Docs/Behavior Alignment (Remaining)

- Mark tool descriptions as either:
- Prompt builder (returns guidance/prompt)
- Artifact writer (writes files)
- Add one minimal first-time flow example:
1. `generate_cucumber_pom`
2. `validate_and_write`
3. `run_cucumber_test`

## Open Items

✅ All Phase 7 items are resolved. No open items remain.

## Verification Notes

Latest end-user tool-call validation through real MCP stdio flow passed for:

- `setup_project`
- `repair_project`
- `analyze_coverage`
- `start_appium_session`
- `inspect_ui_hierarchy`
- `verify_selector`
- `end_appium_session`

Negative matrix validation also confirmed expected structured errors for:

- malformed config
- missing config fields
- unknown profile name
- Appium unreachable server
- invalid capabilities/driver