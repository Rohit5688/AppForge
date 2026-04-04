# TASK-23 — MCP SDK Modernization: Migrate to `server.registerTool()`

**Status**: TODO  
**Priority**: 🔴 P0 — Architectural (Blocks SDK upgrade path)  
**Effort**: Large  
**Applies to**: AppForge  

---

## Problem

AppForge uses the **deprecated** `setRequestHandler(ListToolsRequestSchema)` / `setRequestHandler(CallToolRequestSchema)` pattern in `src/index.ts`. The current MCP TypeScript SDK recommends `server.registerTool()` exclusively.

The old pattern:
- Cannot support per-tool `annotations` (`readOnlyHint`, `destructiveHint`, etc.)
- Cannot support `structuredContent` in responses
- Cannot support `outputSchema` (typed structured responses)
- Is incompatible with future SDK versions and breaking changes
- All tools listed in one giant array — hard to maintain

---

## What To Do

Migrate `src/index.ts` from:
```typescript
// OLD — Deprecated
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...] }));
this.server.setRequestHandler(CallToolRequestSchema, async (request) => { switch(name) { ... } });
```

To:
```typescript
// NEW — Modern API, call inside constructor or setupToolHandlers()
this.server.registerTool(
  "tool_name",
  {
    title: "Human Readable Name",
    description: "...",
    inputSchema: z.object({ ... }).strict(),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params) => {
    // handler body — same logic as current switch case
    return { content: [{ type: "text", text: result }] };
  }
);
```

### Annotation Guide Per Tool

| Tool | readOnly | destructive | idempotent | openWorld |
|---|---|---|---|---|
| `setup_project` | false | true | false | false |
| `upgrade_project` | false | false | true | false |
| `repair_project` | false | false | true | false |
| `manage_config` (read) | true | false | true | false |
| `manage_config` (write) | false | false | false | false |
| `inject_app_build` | false | false | false | false |
| `analyze_codebase` | true | false | false | false |
| `execute_sandbox_code` | false | false | false | false |
| `generate_cucumber_pom` | true | false | false | false |
| `audit_utils` | true | false | false | false |
| `validate_and_write` | false | true | false | false |
| `run_cucumber_test` | false | false | false | false |
| `inspect_ui_hierarchy` | true | false | false | false |
| `self_heal_test` | true | false | false | false |
| `set_credentials` | false | false | false | false |
| `manage_users` | false | false | false | false |
| `audit_mobile_locators` | true | false | false | false |
| `summarize_suite` | true | false | false | false |
| `check_environment` | true | false | false | false |
| `generate_ci_workflow` | false | false | false | false |
| `train_on_example` | false | false | false | false |
| `export_team_knowledge` | true | false | true | false |
| `suggest_refactorings` | true | false | false | false |
| `export_bug_report` | true | false | true | false |
| `generate_test_data_factory` | true | false | true | false |
| `request_user_clarification` | false | false | false | false |
| `analyze_coverage` | true | false | false | false |
| `migrate_test` | true | false | true | false |
| `start_appium_session` | false | false | false | false |
| `end_appium_session` | false | false | false | false |
| `verify_selector` | true | false | true | false |
| `workflow_guide` | true | false | true | false |

### Implementation Note

The `AppForgeServer` class uses a `setupToolHandlers()` private method. Replace the two `setRequestHandler` calls inside it with individual `this.server.registerTool(...)` calls.

Also:
- Add `import { z } from "zod"` if not already present
- Remove `ListToolsRequestSchema`, `CallToolRequestSchema` imports if unused elsewhere
- Keep `textResult()` and `validateArgs()` helpers — they are still useful

---

## Files Changed
- `src/index.ts` — full migration inside `setupToolHandlers()`

## Verification
```bash
npm run build   # Must pass with zero errors
```

---

## Notes
- Large refactor — do tool-by-tool in sequential passes.
- Keep all handler logic **identical** — this is structural, not logic.
- After completing, TASK-24 (structuredContent) and TASK-25 (CHARACTER_LIMIT) can proceed.
- Reference: `c:\\Users\\Rohit\\mcp\\TestForge\\Skills\\reference\\node_mcp_server.md`
