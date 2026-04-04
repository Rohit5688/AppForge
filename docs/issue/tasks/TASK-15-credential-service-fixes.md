# TASK-15 — CredentialService: Fix manage_users Helper Path + set_credentials Purpose Clarification

**Status**: TODO  
**Effort**: Small (~25 min)  
**Depends on**: Nothing — standalone  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Two related changes in `CredentialService.ts` and one tool description fix in `index.ts`.

**Bug A — `manage_users` writes `getUser.ts` to hardcoded `utils/` dir (AUDIT-08)**  
`generateUserHelper()` always writes to `<projectRoot>/utils/getUser.ts` regardless of what
`mcp-config.json` says for `paths.utilsRoot`. Projects that use `src/utils/` will find the
helper in the wrong directory and imports will fail.

**Bug B — `set_credentials` description is misleading (AUDIT-09, Redesigned)**  
`set_credentials` writes to `.env`. The previous plan was to add a gitignore guard.  
However, per updated design: **`.env` files are for non-secret config only** (BASE_URL,
FEATURE_FLAGS, TIMEOUT values). Passwords and API secrets must NEVER go in `.env`.

The fix here is **not** to add gitignore logic — it is to **update the tool description**
so the LLM is instructed not to put credentials there.

> **Credential storage is handled separately in TASK-17** via a project-local JSON file in
> a `credentials/` directory that is always gitignored by design.

---

## What to Change

### Fix A — File: `c:\Users\Rohit\mcp\AppForge\src\services\CredentialService.ts`

#### Step 1 — Read utilsRoot from config in `generateUserHelper()`

Find the `generateUserHelper()` private method. It contains:
```typescript
const utilsDirPath = path.join(projectRoot, 'utils');
// ...
const helperPath = path.join(projectRoot, 'utils', 'getUser.ts');
```

Replace those two hardcoded lines with dynamic resolution:
```typescript
// Resolve utils directory from config, not hardcoded path
let utilsDir = 'utils'; // Default fallback
try {
  const config = this.mcpConfigService.read(projectRoot);
  if (config.paths && 'utilsRoot' in config.paths) {
    utilsDir = (config.paths as any).utilsRoot;
  }
} catch {
  // Config unreadable — use default fallback
}
const utilsDirPath = path.join(projectRoot, utilsDir);
const helperPath = path.join(utilsDirPath, 'getUser.ts');
```

Also update the `relativePath` calculation that uses the hardcoded `utils` path.
After your change, `utilsDirPath` is already dynamic — the `path.relative(utilsDirPath, testDataPath)`
call will resolve correctly automatically with no further changes.

---

### Fix B — File: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

#### Step 2 — Update `set_credentials` tool description

Find the `set_credentials` tool definition. Replace its `description` with:

```typescript
description: `SAVE NON-SECRET ENV CONFIG. Writes non-sensitive configuration values (Base URLs, feature flags, timeouts, endpoint paths) to the project .env file. 

⚠️ THIS TOOL IS NOT FOR PASSWORDS OR API SECRETS.
Do NOT use this tool for: usernames, passwords, tokens, API keys, client secrets.

For credentials (login users, API tokens), use manage_users which stores them in a gitignored credentials/ JSON file.

Non-secret examples that belong here:
  BASE_URL=https://staging.example.com
  API_TIMEOUT=30000
  FEATURE_FLAGS_ENABLED=true
  MOCK_SERVER_PORT=3001

Returns: confirmation with the .env file path updated.`,
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. For Fix A: Search `CredentialService.ts` for `path.join(projectRoot, 'utils')` — must return **zero matches** (both occurrences replaced by `utilsDirPath`).
3. For Fix B: Read the `set_credentials` tool description — must contain "NOT FOR PASSWORDS" warning.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `generateUserHelper()` reads `utilsRoot` from config (fallback to `'utils'`)
- [ ] No hardcoded `path.join(projectRoot, 'utils')` in `CredentialService.ts`
- [ ] `set_credentials` description explicitly says it is for non-secret config ONLY
- [ ] `set_credentials` description directs to `manage_users` for credentials
- [ ] Change `Status` above to `DONE`
