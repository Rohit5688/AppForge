# TASK-09 — Sandbox Security: readFile Path Guard + Promise Escape Fix

**Status**: DONE  
**Effort**: Small (~25 min)  
**Depends on**: Nothing — standalone  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Two related security vulnerabilities in `execute_sandbox_code`:

**Vulnerability A — `readFile` API reads any file on disk (AUDIT-06)**  
The `readFile` API method exposed to sandbox scripts has no path restriction.  
A malicious script can call:
```javascript
return await forge.api.readFile('/etc/passwd');
return await forge.api.readFile('C:\\Windows\\System32\\config\\SAM');
```
This bypasses the `BLOCKED_PATTERNS` checks because `/etc/passwd` is data, not code.

**Vulnerability B — `Promise` in VM context enables prototype chain escape (AUDIT-07)**  
Exposing the host `Promise` constructor allows a script to recover `AsyncFunction` from the
prototype chain, bypassing the `Function: undefined` block:
```javascript
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
return await AsyncFunction('return process.env')();
```
The `BLOCKED_PATTERNS` regex does NOT block `Object.getPrototypeOf`.

---

## What to Change

### File A: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

#### Step 1 — Fix the `readFile` API to require a projectRoot and validate the path

Search for this block (around line 769):
```typescript
readFile: async (filePath: string) => {
  const fs = await import('fs');
  return fs.default.readFileSync(filePath, 'utf8');
},
```

Replace with:
```typescript
readFile: async ({ filePath, projectRoot }: { filePath: string; projectRoot: string }) => {
  const fs = await import('fs');
  const path = await import('path');
  // Security: ensure the resolved path is strictly inside projectRoot
  const resolvedRoot = path.default.resolve(projectRoot);
  const resolvedFile = path.default.resolve(resolvedRoot, filePath);
  if (!resolvedFile.startsWith(resolvedRoot + path.default.sep) && resolvedFile !== resolvedRoot) {
    throw new Error(`[SECURITY] Path traversal blocked. "${filePath}" resolves outside projectRoot.`);
  }
  if (!fs.default.existsSync(resolvedFile)) {
    throw new Error(`File not found: ${resolvedFile}`);
  }
  return fs.default.readFileSync(resolvedFile, 'utf8');
},
```

### File B: `c:\Users\Rohit\mcp\AppForge\src\services\SandboxEngine.ts`

#### Step 2 — Block `Object.getPrototypeOf` in BLOCKED_PATTERNS

Find the `BLOCKED_PATTERNS` array (it's a `const` array of regex patterns near the top of the file).
Add these two entries to it:

```typescript
/Object\s*\.\s*getPrototypeOf/,      // blocks prototype chain escape via AsyncFunction
/Object\s*\.\s*getOwnPropertyDescriptor/, // blocks property descriptor access on host objects
```

#### Step 3 — Replace host `Promise` with an isolated version

Find where `Promise` is injected into the VM sandbox context. It will look like:
```typescript
const sandbox = {
  // ... other entries ...
  Promise,
  // ...
```

Replace `Promise` with a sandboxed wrapper that does NOT expose the host prototype:
```typescript
Promise: class SandboxPromise<T> extends Promise<T> {},
```

This creates a subclass that severs the direct prototype link back to the host `Function` constructor.

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Verify the `readFile` signature change: search for `forge.api.readFile` — callers must now pass `{ filePath, projectRoot }` not just a string.
   - Check if any existing callers in the codebase or docs pass a plain string and update them.
3. Verify BLOCKED_PATTERNS includes `Object\s*\.\s*getPrototypeOf`.

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] `readFile` API validates path is inside `projectRoot` before reading
- [x] Path traversal attempt returns a clear `[SECURITY]` error, not a crash
- [x] `Object.getPrototypeOf` blocked in `BLOCKED_PATTERNS`
- [x] `Object.getOwnPropertyDescriptor` blocked in `BLOCKED_PATTERNS`
- [x] `Promise` in sandbox context does not expose host prototype chain
- [x] Change `Status` above to `DONE`
