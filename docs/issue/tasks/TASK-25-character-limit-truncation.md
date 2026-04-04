# TASK-25 — Add `CHARACTER_LIMIT` Truncation to Large-Output Tools

**Status**: TODO  
**Priority**: 🟡 P2 — Reliability  
**Effort**: Small  
**Applies to**: AppForge  

---

## Problem

Several AppForge tools can return responses large enough to flood the LLM's context window. The `node_mcp_server.md` Skills guide mandates a `CHARACTER_LIMIT = 25000` ceiling with a truncation message.

Affected tools (current state — no truncation):
- `inspect_ui_hierarchy` — full Appium XML can exceed 100k chars on complex apps
- `analyze_codebase` — iterates every source file and returns all content
- `execute_sandbox_code` — sandbox stdout is unbounded
- `run_cucumber_test` — raw Cucumber output can exceed 50k chars
- `check_environment` — full Appium stack report with verbose device logs

---

## What To Do

### 1. Add the constant near the top of `src/index.ts`:
```typescript
const CHARACTER_LIMIT = 25_000;
```

### 2. Add a truncation helper in the `AppForgeServer` class:
```typescript
private truncate(text: string, context?: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) +
    `\n\n... [TRUNCATED — response exceeded ${CHARACTER_LIMIT} chars${context ? '. Tip: ' + context : ''}]`;
}
```

### 3. Apply to these tools:

**`inspect_ui_hierarchy`:**
```typescript
const result = await this.executionService.inspectHierarchy(args.xmlDump, args.screenshotBase64);
const text = this.truncate(JSON.stringify(result, null, 2), "use xmlDump with a specific subtree to reduce output");
return this.textResult(text);
```

**`analyze_codebase`:**
```typescript
const result = await this.analyzerService.analyze(args.projectRoot, paths);
const text = this.truncate(JSON.stringify(result, null, 2), "use execute_sandbox_code for targeted analysis");
return this.textResult(text);
```

**`execute_sandbox_code`:**  
Already returns `sandboxResult.output` string — wrap with `this.truncate()` before returning.

**`run_cucumber_test`:**
```typescript
const hint = result.success ? "✅ ..." : "❌ ...";
const body = this.truncate(JSON.stringify({ ...result, hint }, null, 2), "use specific tags to scope the run");
return this.textResult(body);
```

**`check_environment`:**
```typescript
const body = this.truncate(JSON.stringify({ summary, data, hint }, null, 2));
return this.textResult(body);
```

---

## Files Changed
- `src/index.ts` — add constant + `truncate()` method + 5 tool wrappers

## Verification
```bash
npm run build   # Must pass with zero errors
```

No functional change — purely defensive output truncation.
