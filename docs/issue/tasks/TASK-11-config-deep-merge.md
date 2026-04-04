# TASK-11 — manage_config: Implement Deep Merge (Shallow Merge Bug Fix)

**Status**: DONE  
**Effort**: Small (~20 min)  
**Depends on**: Nothing — standalone  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

`manage_config` (write operation) uses a shallow spread merge:
```typescript
const newConfig = { ...existingConfig, ...config };
```

This **silently destroys nested objects**. If a caller writes only
`{ mobile: { defaultPlatform: 'ios' } }`, the entire existing
`mobile.capabilitiesProfiles` object is replaced with whatever `mobile` contains in the
incoming partial config — wiping all configured device profiles.

The tool description says *"only keys you provide are updated, all others are preserved"* —
this is false for nested objects. Every nested key at depth > 1 is silently deleted.

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\McpConfigService.ts`

---

## What to Change

#### Step 1 — Add `deepMerge()` private method to `McpConfigService`

Open `McpConfigService.ts` and add this private static method inside the class,
BEFORE the `write()` method:

```typescript
/**
 * Recursively merges `source` into `target`.
 * Arrays are replaced (not concatenated) — this matches config update expectations.
 * Primitives in source always overwrite target.
 */
private static deepMerge(target: any, source: any): any {
  // Null/undefined source → keep target unchanged
  if (source === null || source === undefined) return target;
  // Non-object source → source replaces target
  if (typeof source !== 'object' || Array.isArray(source)) return source;
  // Both objects → merge recursively
  const output: any = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target?.[key] !== null &&
      typeof target?.[key] === 'object' &&
      !Array.isArray(target?.[key])
    ) {
      output[key] = McpConfigService.deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}
```

#### Step 2 — Use `deepMerge` in the `write()` method

Find the `write()` method. It will contain something like:
```typescript
const newConfig = { ...existingConfig, ...config };
```

Replace that single line with:
```typescript
const newConfig = McpConfigService.deepMerge(existingConfig, config);
```

Do NOT change anything else in the `write()` method.

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Manual trace to verify correctness:
   - `deepMerge({ mobile: { profiles: { prod: 'a' }, default: 'android' } }, { mobile: { default: 'ios' } })`
   - Expected result: `{ mobile: { profiles: { prod: 'a' }, default: 'ios' } }`
   - `profiles.prod` must be preserved (deep merge, not overwritten).
3. Search for `{ ...existingConfig, ...config }` — must return **zero matches** in the file.

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] `deepMerge()` private static method exists in `McpConfigService`
- [x] `write()` uses `deepMerge()` instead of spread
- [x] Nested objects (e.g. `mobile.capabilitiesProfiles`) are preserved when writing a partial config
- [x] Change `Status` above to `DONE`
