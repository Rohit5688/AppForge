# run_cucumber_test: Configurable timeout — Issue & Fix Plan

## Summary
The appForge MCP tool `run_cucumber_test` currently enforces a fixed/implicit timeout for running the Playwright-BDD / Cucumber test suite. This causes long-running suites to be killed prematurely and makes the tool inconsistent with timeouts defined in the test codebase (e.g., playwright.config.ts / project-level test timeout settings).

## Impact
- Flaky CI runs for long tests
- Inconsistent behavior between local runs and MCP-run tests
- Hard to debug timeouts because tool-level timeout is not visible/configurable

## Root Cause
The MCP tool does not expose a timeout parameter and has no deterministic fallback to the test project's configured timeout (playwright/cucumber config). Tool execution uses a fixed process timeout (or default child-process behavior) rather than reading a configured value.

## Goal
Make `run_cucumber_test` honor a configurable timeout, with the following resolution order:
1. Explicit timeout passed to the tool (e.g., timeoutMs)
2. Project MCP config (mcp-config.json) setting (e.g., execution.timeoutMs or runCucumber.timeoutMs)
3. Timeout inferred from the test codebase (e.g., playwright.config.ts or package.json test script config)
4. Reasonable server default (documented)

## High-level Fix (no code changes in this repo; plan only)
1. **API change**: Extend `run_cucumber_test` tool schema to accept an optional timeout parameter (name: `timeoutMs`, type: number).
2. **Config**: Add optional config key to mcp-config.json schema (e.g., `tools.runCucumber.timeoutMs` or `execution.defaultTimeoutMs`).
3. **Resolution logic** (tool implementation):
   - If `timeoutMs` provided in the tool call, use it.
   - Else if `mcp-config.json` contains `tools.runCucumber.timeoutMs` (or `execution.defaultTimeoutMs`), use it.
   - Else try to detect the project's own timeout:
     - Look for Playwright config files (playwright.config.ts / playwright.config.js) and parse `timeout` or `timeout` inside projects / use of `expect.setTimeout`.
     - If Playwright config is not present, check package.json scripts for known test CLIs or a `testTimeout` key used by the project.
     - If detection yields a value, use that.
   - Else use a documented server default (e.g., 30 minutes / 1800000 ms).
4. **Implementation details**:
   - When spawning the test process, pass a hard timeout (kill after timeout) and ensure graceful shutdown (SIGINT → SIGTERM → SIGKILL).
   - When possible, pass the timeout to the test runner CLI (e.g., Playwright accepts `--timeout` or via env var) to let the test runner manage internal timeouts.
   - Log the chosen timeout and its source (explicit / mcp-config / detected / default) in the tool output.
   - Validate `timeoutMs` input (positive integer, upper bound guard).
5. **Tests**:
   - Unit tests for the resolution logic (explicit → config → detect → default).
   - Integration test: run a deliberately long-running dummy test to verify the tool will let it complete when properly configured.
6. **Documentation**:
   - Update McpConfig.md and docs/ExecutionAndHealing.md to document the new config key and the priority order.
   - Add examples showing how to call `run_cucumber_test` with `timeoutMs` and how to set it in mcp-config.json.
7. **Backwards compatibility & migration**:
   - Keep current default behavior if no config supplied.
   - Add release notes describing new config and CLI/tool parameter.
8. **Security and safety**:
   - Sanitize numeric inputs.
   - Cap maximum allowed timeout in server policy (if needed) to avoid runaway processes.

## Implementation Checklist
- [x] Add `timeoutMs` property to `run_cucumber_test` tool schema (optional)
- [x] Add `execution.timeoutMs` to mcp-config.json schema support
- [x] Implement resolution logic in MCP server run_cucumber_test handler:
  - [x] Read explicit param
  - [x] Read mcp-config.json execution.timeoutMs
  - [x] Detect project-level timeout (parse playwright.config.ts/js)
  - [x] Apply default (30 minutes = 1800000ms)
  - [x] Log source of timeout in output
- [x] Update process spawn to support enforced timeout (using child_process timeout option)
- [x] Add unit tests for resolution logic (ExecutionService.timeout.test.ts)
- [ ] Add integration test (long-running dummy test) to verify behavior
- [ ] Update docs (McpConfig.md, ExecutionAndHealing.md) with examples and default values
- [ ] Add release notes / migration guide
- [ ] Run CI and verify no regressions

## Implementation Summary

### Changes Made

1. **ExecutionService.ts** - Added timeout resolution logic:
   - New `timeoutMs` optional parameter in `runTest()` method
   - `resolveTimeout()` private method implementing priority-based resolution
   - `detectProjectTimeout()` private method for auto-detection from playwright.config files
   - Timeout logging in output with source information
   - 2-hour (7200000ms) safety cap to prevent runaway processes
   - Input validation for explicit timeout values

2. **index.ts** - Updated MCP tool schema:
   - Added `timeoutMs` optional parameter to `run_cucumber_test` tool
   - Updated tool description to document timeout resolution order
   - Passes timeoutMs to ExecutionService.runTest()

3. **ExecutionService.timeout.test.ts** - Comprehensive test suite:
   - Tests for explicit timeout priority
   - Tests for mcp-config timeout fallback
   - Tests for playwright.config detection
   - Tests for default timeout fallback
   - Tests for timeout capping and validation
   - Tests for priority order verification

### Timeout Resolution Order
1. **Explicit parameter** (`timeoutMs` in tool call) - Highest priority
2. **mcp-config.json** (`execution.timeoutMs` key)
3. **Auto-detected** from `playwright.config.ts` or `playwright.config.js` (timeout/expect.timeout/testTimeout patterns)
4. **Default** - 30 minutes (1800000ms) - Lowest priority

### Safety Features
- Maximum timeout capped at 2 hours (7200000ms)
- Validation rejects negative or zero timeout values
- Logs warning when capping is applied
- Fails fast with clear error message for invalid inputs

### Output Format
Test output now includes timeout information:
```
[Timeout: 60000ms (source: explicit)]

<test output here>
```

## Notes / Implementation Hints
- Use milliseconds for `timeoutMs` across the tool and config.
- Playwright: check `playwright.config.*` for `timeout` and `expect.timeout` entries. Use a simple AST or regex approach to extract numeric literals; fall back to node `require` for JS config (safe only if sandboxed).
- Prefer not to rely on brittle regexes; document detection as best-effort and recommend explicit configuration via `mcp-config.json` for reliability.
- Ensure logs include "timeout source: explicit | mcp-config | detected(playwright.config) | default".