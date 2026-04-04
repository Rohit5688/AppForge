# TASK-10 — EnvironmentCheckService: Replace exec(string) with execFile

**Status**: DONE  
**Effort**: Small (~20 min)  
**Depends on**: Nothing — standalone  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

`EnvironmentCheckService.ts` uses `exec` (shell-invoking) throughout instead of `execFile`.
Every other service was already migrated to `execFile` in a prior session — this one was missed.

`exec(string)` spawns a shell (`/bin/sh -c` on Unix, `cmd.exe /c` on Windows). The `projectRoot`
parameter passed to `check()` is used in path operations but never validated, so a crafted path
with shell metacharacters can escape. `execFile` never invokes a shell.

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\EnvironmentCheckService.ts`

---

## What to Change

#### Step 1 — Change the import at the top of the file

Find (line ~1):
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
```

Replace with:
```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
```

#### Step 2 — Fix `checkNode()`

Find:
```typescript
const { stdout } = await execAsync('node --version');
```
Replace with:
```typescript
const { stdout } = await execFileAsync('node', ['--version']);
```

#### Step 3 — Fix `checkAppiumDrivers()`

Find:
```typescript
const { stdout } = await execAsync('appium driver list --installed --json');
const drivers = JSON.parse(stdout);
```
Replace with:
```typescript
const { stdout } = await execFileAsync('appium', ['driver', 'list', '--installed', '--json']);
let drivers: Record<string, any>;
try {
  drivers = JSON.parse(stdout);
} catch {
  // Appium printed non-JSON output (warnings, deprecation notices)
  // Fall back: check if the output contains the driver name as plain text
  const fallbackText = stdout.toLowerCase();
  const needed = platform === 'ios' ? 'xcuitest' : 'uiautomator2';
  return fallbackText.includes(needed)
    ? { name: 'Appium Driver', status: 'pass', message: `${needed} driver appears installed (fallback parse)` }
    : { name: 'Appium Driver', status: 'warn', message: 'Could not parse driver list JSON', fixHint: `Verify with: appium driver list --installed` };
}
```

#### Step 4 — Fix `checkAndroidEmulator()`

Find:
```typescript
const { stdout } = await execAsync('adb devices');
```
Replace with:
```typescript
const { stdout } = await execFileAsync('adb', ['devices']);
```

#### Step 5 — Fix `checkXcode()`

Find:
```typescript
const { stdout } = await execAsync('xcodebuild -version');
```
Replace with:
```typescript
const { stdout } = await execFileAsync('xcodebuild', ['-version']);
```

#### Step 6 — Fix `checkIosSimulator()`

Find:
```typescript
const { stdout } = await execAsync('xcrun simctl list devices booted --json');
```
Replace with:
```typescript
const { stdout } = await execFileAsync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json']);
```

#### Step 7 — Add `projectRoot` validation to `check()`

Find the start of the `check()` method:
```typescript
public async check(projectRoot: string, platform: string = 'android', appPath?: string): Promise<EnvironmentReport> {
  const checks: EnvironmentCheck[] = [];
```

Add validation immediately after the opening:
```typescript
public async check(projectRoot: string, platform: string = 'android', appPath?: string): Promise<EnvironmentReport> {
  const checks: EnvironmentCheck[] = [];

  // Security: validate projectRoot before any filesystem operations
  const path = await import('path');
  const resolvedRoot = path.default.resolve(projectRoot);
  if (!resolvedRoot || resolvedRoot === path.default.sep) {
    return {
      ready: false,
      checks: [{ name: 'Validation', status: 'fail', message: 'projectRoot is invalid or empty.' }],
      summary: '❌ Invalid projectRoot. Provide an absolute path to your project directory.'
    };
  }
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Search for `execAsync` in the file — result must be **zero matches** (all replaced).
3. Search for `promisify(exec)` — result must be **zero matches**.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `execAsync` (from `exec`) completely removed — zero occurrences in the file
- [ ] All 5 shell calls now use `execFileAsync` with an args array
- [ ] `JSON.parse` of Appium driver output has a try-catch fallback (AUDIT-12 fix included)
- [ ] `projectRoot` is validated at the start of `check()`
- [ ] Change `Status` above to `DONE`
