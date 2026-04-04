# TASK-12 — McpConfigService: Eliminate Side-Effectful read() + Fix Defaults Pollution

**Status**: DONE  
**Effort**: Small (~25 min)  
**Depends on**: Nothing — standalone  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Two related bugs in `McpConfigService.ts` — both in the same file, fixed together.

**Bug A — `read()` writes to disk as a side effect (AUDIT-02)**  
Every `configService.read()` call checks for an old `version` field and, if found,
**silently writes back to disk** and regenerates the JSON schema. Tools like
`check_environment`, `analyze_coverage`, and `audit_mobile_locators` call `read()` for
read-only checks but mutate the user's config file as a side effect. This is unexpected
and a race condition risk if two tools run concurrently.

**Bug B — `resolvePaths()` defaults permanently written to disk (AUDIT-16)**  
`read()` calls `resolvePaths()` which injects default path values into the returned object.
When any tool reads then writes config (e.g. `manage_config` write), those auto-injected
defaults get persisted. The config file grows with fields user never set. Users cannot
return to default behavior without manually deleting fields.

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\McpConfigService.ts`

---

## What to Change

#### Step 1 — Extract migration logic into `migrateIfNeeded()`

Find the `read()` method. Inside it, locate the migration block that looks like:
```typescript
if (!raw.version || raw.version === '1.0.0') {
  raw.version = this.CURRENT_VERSION;
  this.write(projectRoot, raw);
  this.generateSchema(projectRoot);
}
```

**Delete those lines** from `read()`.

Add a new **public** method to the class (place it right after `read()`):
```typescript
/**
 * Migrates an old-format mcp-config.json to the current schema version.
 * Call ONLY from setup_project and upgrade_project — NOT from read().
 * All other callers use read() for pure data access with zero side effects.
 */
public migrateIfNeeded(projectRoot: string): void {
  const configPath = this.getConfigPath(projectRoot);
  if (!fs.existsSync(configPath)) return;

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!raw.version || raw.version !== this.CURRENT_VERSION) {
    raw.version = this.CURRENT_VERSION;
    fs.writeFileSync(configPath, JSON.stringify(raw, null, 2), 'utf8');
    this.generateSchema(projectRoot);
  }
}
```

> **Note**: If `getConfigPath()` does not exist as a method, look for how `read()` constructs
> the config file path (usually `path.join(projectRoot, 'mcp-config.json')`) and use that directly.

#### Step 2 — Fix `read()` to NOT inject defaults into the returned object

Find in `read()`:
```typescript
raw.paths = resolvePaths(raw);
return raw as McpConfig;
```
(or similar — `resolvePaths` called and result stored back on `raw` before returning)

Replace with — return the raw disk content unchanged, apply defaults only at point-of-use:
```typescript
return raw as McpConfig;
```
Delete the `raw.paths = resolvePaths(raw)` line entirely.

#### Step 3 — Fix `getPaths()` to apply defaults at point-of-use

Find the `getPaths()` method (it converts config to path strings for consumers).
Ensure `resolvePaths` is called inside `getPaths()`:
```typescript
public getPaths(config: McpConfig): ResolvedPaths {
  return resolvePaths(config);  // defaults applied HERE, never persisted
}
```
If `getPaths()` already calls `resolvePaths`, no change needed here.

#### Step 4 — Call `migrateIfNeeded()` from setup and upgrade handlers

Search for these two handlers in `src/index.ts`:
```
case "setup_project":
case "upgrade_project":
```

In each handler, after the existing service call, add:
```typescript
this.configService.migrateIfNeeded(args.projectRoot);
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Verify `read()` no longer contains any `this.write(` call (search: `read()` block should have 0 `write(` calls).
3. Verify `read()` no longer calls `resolvePaths` and stores it back on `raw`.

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] `read()` has zero `write()` calls inside it (no disk mutation on read)
- [x] `read()` returns raw config without injecting defaults into it
- [x] `getPaths()` is the sole point where `resolvePaths()` defaults are applied
- [x] `migrateIfNeeded()` is a separate public method
- [x] `migrateIfNeeded()` is called from `setup_project` and `upgrade_project` handlers in `index.ts`
- [x] Change `Status` above to `DONE`
