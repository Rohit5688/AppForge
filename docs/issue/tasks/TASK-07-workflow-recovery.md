# TASK-07 — Workflow Guide Error Recovery Paths

**Status**: TODO  
**Effort**: Small (~20 min)  
**Depends on**: Nothing — standalone description-only change  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

**The problem this solves:**

`workflow_guide` returns a linear happy-path sequence of tool calls.
When any step fails, the LLM has no recovery instructions — it either retries in a loop or stops.

For example: `write_test` workflow says:
1. `execute_sandbox_code`
2. `inspect_ui_hierarchy`
3. `generate_cucumber_pom`
4. `validate_and_write`
5. `run_cucumber_test`

If step 2 fails (no session), the LLM doesn't know to skip step 2 and use the known Page Objects instead.
If step 4 fails (TypeScript error), the LLM doesn't know to read the error and fix the import.
If step 5 fails (element not found), the LLM doesn't know to call `self_heal_test`.

This task adds `onFailure` branches to each step in the `write_test` workflow.

---

## What to Change

### File: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

Find the `case "workflow_guide":` handler (or the function that returns workflow steps).
Find the `write_test` workflow object/string.

Replace the `write_test` workflow steps with this updated version:

```typescript
write_test: {
  description: "Generate a new Cucumber BDD test scenario from plain English.",
  steps: [
    {
      step: 1,
      tool: "execute_sandbox_code",
      purpose: "Scan codebase: get existing steps, page objects, and architecture pattern.",
      onSuccess: "Pass result to generate_cucumber_pom as context.",
      onFailure: "If projectRoot is wrong, check mcp-config.json. If scan returns empty, project may be new — proceed to step 2 with empty context."
    },
    {
      step: 2,
      tool: "inspect_ui_hierarchy",
      purpose: "Get snapshot of the NEW screen being built. Use stepHints=[...your steps].",
      prerequisite: "Active session required. Call start_appium_session first if not connected.",
      condition: "SKIP THIS STEP if ALL screens in the test already have Page Objects (check step 1 output).",
      onSuccess: "Pass snapshot to generate_cucumber_pom as screenContext.",
      onFailure: "If session is dead: skip this step and use known Page Object locators from step 1. If screen not found: ensure app is on correct screen before calling."
    },
    {
      step: 3,
      tool: "generate_cucumber_pom",
      purpose: "Generate feature file, step definitions, and Page Object.",
      onSuccess: "Pass generated JSON to validate_and_write.",
      onFailure: "If generation is incomplete or JSON is malformed: retry with a shorter, more focused testDescription. Break complex flows into smaller scenarios."
    },
    {
      step: 4,
      tool: "validate_and_write",
      purpose: "Validate TypeScript and Gherkin syntax, then write files to disk.",
      onSuccess: "Proceed to run_cucumber_test.",
      onFailure: "If TypeScript error: read the error message, fix the specific import or type issue in the generated code, retry validate_and_write. If Gherkin error: check step definition patterns match feature file exactly."
    },
    {
      step: 5,
      tool: "run_cucumber_test",
      purpose: "Execute the generated test to verify it passes.",
      onSuccess: "Test complete. Review HTML report at configured reportPath.",
      onFailure: "If 'element not found': call self_heal_test with the error output — it will suggest replacement selectors automatically using cached XML. If 'session expired': restart session and re-run. If 'step not defined': a step in the feature has no matching step definition — add it."
    }
  ]
}
```

Also update the `inspect_device` workflow to add a recovery path for session start failure:

```typescript
inspect_device: {
  description: "Connect to device and inspect current screen.",
  steps: [
    {
      step: 1,
      tool: "start_appium_session",
      purpose: "Connect to the device.",
      prerequisite: "App must be installed. Appium server must be running.",
      onSuccess: "Note the navigationHints in the response — use them instead of navigating through UI.",
      onFailure: "If 'session not created': verify app is installed (adb install <apk> for Android). Check mcp-config.json has correct appium:app path and appium:deviceName. Run check_environment to diagnose."
    },
    {
      step: 2,
      tool: "inspect_ui_hierarchy",
      purpose: "Get snapshot of current screen.",
      onSuccess: "Use #ref numbers and locators from snapshot in your Page Object.",
      onFailure: "If session expired between steps: call start_appium_session again. If app crashed: relaunch app manually then retry."
    }
  ]
}
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Call `workflow_guide` with `workflow: "write_test"` — confirm response includes `onFailure` fields.
3. Call `workflow_guide` with `workflow: "inspect_device"` — confirm recovery for session failure is present.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `write_test` workflow has `onFailure` for all 5 steps
- [ ] `inspect_device` workflow has `onFailure` for session start failure
- [ ] `onFailure` for step 5 mentions `self_heal_test` explicitly
- [ ] `onFailure` for step 2 says to SKIP and use known Page Objects if session is unavailable
- [ ] Change `Status` above to `DONE`
