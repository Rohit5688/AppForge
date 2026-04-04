# TASK-16 — FileWriterService: Fix Staging tsconfig Absolute Paths + summarize_suite Duration

**Status**: TODO  
**Effort**: Small (~20 min)  
**Depends on**: Nothing — standalone  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Two small unrelated fixes in two different files, bundled together because each is tiny.

**Bug A — `validate_and_write` staging tsconfig uses absolute machine paths (AUDIT-15)**  
`FileWriterService.validateTypeScript()` writes a staging `tsconfig.json` with absolute paths
(e.g. `C:\Users\dev\project\...`). On CI, workspace paths differ from the developer's machine.
When the generated files are committed and then validated in CI, tsc fails with "path not found"
because the absolute paths don't exist on the CI agent.

**Bug B — `summarize_suite` duration reports 0 seconds for fast tests (AUDIT-13)**  
`SummarySuiteService` uses a threshold of `10_000_000` to detect nanoseconds vs milliseconds.
A test completing in < 10ms has a nanosecond duration of < 10,000,000 — the code treats it as
milliseconds, divides by 1,000 instead of 1,000,000,000, and reports a **massively inflated**
duration (a 5ms test shows as 5,000 seconds).

---

## What to Change

### Fix A — File: `c:\Users\Rohit\mcp\AppForge\src\services\FileWriterService.ts`

#### Step 1 — Fix the staging tsconfig to use relative paths

Find the `validateTypeScript()` private method. Inside it, find where the staging tsconfig
object is built. It will look like:
```typescript
const stagingTsconfig = {
  extends: tsconfigPath,
  compilerOptions: {
    baseUrl: projectRoot,
    rootDir: projectRoot,
    noEmit: true
  },
  include: [
    path.join(stagingDir, '**/*.ts'),
    path.join(projectRoot, '**/*.ts')
  ],
  exclude: [
    path.join(projectRoot, 'node_modules'),
    path.join(projectRoot, '.mcp-staging')
  ]
};
```

Replace with:
```typescript
// Use relative paths in the staging tsconfig so it is portable across machines and CI agents
const relativeExtends = path.relative(stagingDir, tsconfigPath).replace(/\\/g, '/');
const relativeRoot = path.relative(stagingDir, projectRoot).replace(/\\/g, '/') || '.';
const stagingTsconfig = {
  extends: relativeExtends,
  compilerOptions: {
    baseUrl: relativeRoot,
    rootDir: relativeRoot,
    noEmit: true
  },
  include: [
    '**/*.ts',                          // staging dir files (relative)
    `${relativeRoot}/**/*.ts`           // project source files (relative)
  ],
  exclude: [
    `${relativeRoot}/node_modules`,
    `${relativeRoot}/.mcp-staging`
  ]
};
```

---

### Fix B — File: `c:\Users\Rohit\mcp\AppForge\src\services\SummarySuiteService.ts`

#### Step 2 — Fix the nanoseconds/milliseconds detection threshold

Find the duration calculation. It will look like:
```typescript
const durationSec = totalDurationNs > 10_000_000 
  ? Math.round(totalDurationNs / 1_000_000_000)
  : Math.round(totalDurationNs / 1_000);
```

Replace with a higher, unambiguous threshold. One second in nanoseconds is 1,000,000,000.
One second in milliseconds is 1,000. Choose 1,000,000 as the crossover (1,000ms = 1s):
```typescript
// Threshold: if value > 1,000,000 it's almost certainly nanoseconds.
// Cucumber reporters typically use nanoseconds; ms values > 1,000,000 would be 1000 seconds (impossible).
const durationSec = totalDurationNs > 1_000_000_000
  ? Math.round(totalDurationNs / 1_000_000_000)   // nanoseconds → seconds
  : totalDurationNs > 1_000_000
  ? Math.round(totalDurationNs / 1_000)            // microseconds → seconds (rare)
  : Math.round(totalDurationNs / 1_000);           // milliseconds → seconds
```

> **Simpler alternative** if the above is hard to locate: just change `10_000_000` to
> `1_000_000_000` (1 billion). This correctly handles all practical test durations.

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. For Fix A: Open the generated staging tsconfig (create a temp test project and call
   `validate_and_write` with a `.ts` file) — confirm the staging tsconfig uses relative paths.
3. For Fix B: Search `SummarySuiteService.ts` for `10_000_000` — must return zero matches.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] Staging tsconfig uses `path.relative()` for `extends`, `baseUrl`, `rootDir`
- [ ] Staging tsconfig `include`/`exclude` use relative path strings (no absolute system paths)
- [ ] `SummarySuiteService` duration threshold changed from `10_000_000` to `1_000_000_000`
- [ ] Change `Status` above to `DONE`
