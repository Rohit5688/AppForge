# TASK-24 — Add Tool Annotations + `structuredContent` to All Tools

**Status**: TODO  
**Priority**: 🟠 P1 — Quality  
**Effort**: Small  
**Applies to**: AppForge  
**Prerequisite**: TASK-23 must be DONE first (needs `registerTool` pattern)

---

## Problem

After TASK-23 migrates to `server.registerTool()`, two modern SDK features will still be missing:

1. **Tool annotations** — `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint` per tool
2. **`structuredContent`** in responses — enables MCP clients to parse results programmatically

---

## What To Do

### 1. Tool Annotations

Already defined in TASK-23's annotation table. Verify every `registerTool` call has the `annotations` block set correctly.

### 2. `structuredContent` in Tool Responses

For tools that return JSON, add `structuredContent` alongside the text `content`:

**Before:**
```typescript
return this.textResult(JSON.stringify(result, null, 2));
```

**After:**
```typescript
return {
  content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  structuredContent: result
};
```

Note: The current `textResult()` helper only returns `content`. Either:
- Extend `textResult()` to accept an optional `structured` arg, OR
- Return the full object directly in tools that need it

Priority tools to add `structuredContent`:
1. `check_environment` — returns `{ ready, summary, failCount, warnCount }`
2. `summarize_suite` — returns `{ summary, data: { total, passed, failed, skipped } }`
3. `run_cucumber_test` — returns `{ success, output, stats }`
4. `self_heal_test` — returns `{ candidates, promptForLLM }`
5. `inspect_ui_hierarchy` — returns `{ source, elements[], screenshot }`
6. `start_appium_session` — returns `{ sessionId, platform, device }`
7. `verify_selector` — returns `{ exists, displayed, enabled, tagName, text }`
8. `audit_utils` — returns `{ coveragePercent, missing[], actionableSuggestions[] }`

### 3. Update `textResult()` helper (optional improvement)

```typescript
private textResult(text: string, structured?: Record<string, unknown>) {
  const result: any = { content: [{ type: "text", text }] };
  if (structured) result.structuredContent = structured;
  return result;
}
```

---

## Files Changed
- `src/index.ts` — add `structuredContent` to 8 priority tools + verify annotations

## Verification
```bash
npm run build   # Must pass with zero errors
```
