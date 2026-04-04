# TASK-14 — generate_ci_workflow: Add projectRoot Validation + self_heal resource-id Fix

**Status**: DONE  
**Effort**: Small (~20 min)  
**Depends on**: Nothing — standalone  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Two small, unrelated fixes bundled together because they are both tiny (1–3 line changes each).

**Fix A — `generate_ci_workflow` has no projectRoot validation (AUDIT-05)**  
The handler writes the workflow file to disk without validating `projectRoot`:
```typescript
// index.ts — generate_ci_workflow handler
const fullPath = path.default.join(args.projectRoot, workflow.filename);
fs.default.mkdirSync(dir, { recursive: true });
fs.default.writeFileSync(fullPath, workflow.content);
```
A crafted `projectRoot` could write the file outside the project directory. The fix is to call
`validateProjectRoot()` from `SecurityUtils.ts` (already used in `FileWriterService.ts`).

**Fix B — `self_heal_test` resource-id candidates missing `id=` prefix (AUDIT-10)**  
`SelfHealingService.findAlternatives()` returns raw `resource-id` values without the `id=` prefix
that WebdriverIO requires. Every resource-id candidate the tool suggests is immediately invalid.
`ExecutionService.parseXmlElements()` correctly uses `id=${resourceId}` — this fix makes
`SelfHealingService` consistent.

---

## What to Change

### Fix A — File: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

#### Step 1 — Add validateProjectRoot import

Find the existing imports at the top of `index.ts`. Look for:
```typescript
import { AppForgeError } from "./utils/ErrorCodes.js";
```
Add the `validateProjectRoot` import alongside it:
```typescript
import { validateProjectRoot } from "./utils/SecurityUtils.js";
```
(If `SecurityUtils.js` is already imported, just add `validateProjectRoot` to the import list.)

#### Step 2 — Add validation to the generate_ci_workflow handler

Find `case "generate_ci_workflow":` in the handler switch. At the very start of that case block,
add:
```typescript
case "generate_ci_workflow": {
  // Security: validate projectRoot before writing any files
  validateProjectRoot(args.projectRoot);
  
  // ... rest of existing handler unchanged ...
```

---

### Fix B — File: `c:\Users\Rohit\mcp\AppForge\src\services\SelfHealingService.ts`

#### Step 3 — Fix resource-id selector format in `findAlternatives()`

Find the `findAlternatives()` method. Inside it, find the block that handles `resource-id`:
```typescript
} else if (match[0].startsWith('resource-id')) {
  alternatives.push(value);   // ← BUG: missing "id=" prefix
```

Replace that line with:
```typescript
} else if (match[0].startsWith('resource-id')) {
  alternatives.push(`id=${value}`);  // id= prefix required by WebdriverIO
```

That is the entire change — a one-word fix on a single line.

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. For Fix A: Search `index.ts` for `case "generate_ci_workflow"` — the first line of the case body must be `validateProjectRoot(`.
3. For Fix B: Search `SelfHealingService.ts` for `alternatives.push(value)` — must return zero matches (it must now be `alternatives.push(\`id=${value}\`)`).

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `generate_ci_workflow` handler calls `validateProjectRoot` before any filesystem operation
- [ ] `SelfHealingService.findAlternatives()` returns `id=<value>` for resource-id matches
- [ ] No other `alternatives.push(value)` (bare push without prefix) exists in the file
- [ ] Change `Status` above to `DONE`
