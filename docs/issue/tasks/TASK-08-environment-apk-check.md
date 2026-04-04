# TASK-08 — check_environment APK Installability Validation

**Status**: TODO  
**Effort**: Small (~25 min)  
**Depends on**: TASK-10 must be DONE (EnvironmentCheckService will use execFileAsync after TASK-10)  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

`check_environment` returns `"ready": true` even when the configured APK cannot be installed on
the connected device. It checks that the APK file PATH exists — but not that the APK's CPU
architecture (arm64-v8a vs x86_64) matches the connected device.

Real failure: environment check passes → `start_appium_session` crashes with:
`"INSTALL_FAILED_NO_MATCHING_ABIS"` (APK built for physical device, emulator is x86_64).

**The fix**: when `check_environment` is called with an Android APK path, run
`aapt dump badging <apk>` to extract supported ABIs and compare against the device's ABI via `adb`.

**Security note**: This task uses `execFileAsync` (NOT `exec` or `execSync`) with args arrays to
prevent shell injection. The apkPath value must never be interpolated into a string command.

---

## What to Change

### File: `c:\Users\Rohit\mcp\AppForge\src\services\EnvironmentCheckService.ts`

#### Step 1 — Verify the import at the top of the file

Find this existing import (line ~1):
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';
```

Replace with (add `execFile` alongside `exec`):
```typescript
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
```

Add this line immediately after:
```typescript
const execFileAsync = promisify(execFile);
```

#### Step 2 — Add `validateApkAbi()` private method

Add this private method inside the `EnvironmentCheckService` class, BEFORE the `buildSummary` method:

```typescript
/**
 * Validates that the configured APK is compatible with the connected device's CPU architecture.
 * Returns a warn (not a fail) if aapt is unavailable or check cannot complete.
 *
 * SECURITY: Uses execFileAsync with args arrays — apkPath is never interpolated into a shell string.
 */
private async validateApkAbi(apkPath: string): Promise<EnvironmentCheck> {
  if (!fs.existsSync(apkPath)) {
    return {
      name: 'APK ABI Compatibility',
      status: 'fail',
      message: `APK not found at: ${apkPath}`,
      fixHint: `Place the APK at the configured path or run inject_app_build to update the path.`
    };
  }

  // Step 1: Get device ABI via adb (no shell interpolation)
  let deviceAbi: string;
  try {
    const { stdout } = await execFileAsync('adb', ['shell', 'getprop', 'ro.product.cpu.abi']);
    deviceAbi = stdout.trim();
    if (!deviceAbi) {
      return {
        name: 'APK ABI Compatibility',
        status: 'warn',
        message: 'Connected but could not read device ABI — skipping compatibility check.',
        fixHint: 'Ensure adb shell is accessible and the device is fully booted.'
      };
    }
  } catch {
    return {
      name: 'APK ABI Compatibility',
      status: 'warn',
      message: 'No adb device connected — ABI check skipped.',
      fixHint: 'Connect a device or start an emulator, then re-run check_environment.'
    };
  }

  // Step 2: Get APK ABIs via aapt (no shell interpolation — apkPath passed as separate arg)
  let aaptOutput: string;
  try {
    const { stdout } = await execFileAsync('aapt', ['dump', 'badging', apkPath]);
    aaptOutput = stdout;
  } catch (err: any) {
    // aapt not installed — warn, don't fail
    return {
      name: 'APK ABI Compatibility',
      status: 'warn',
      message: 'aapt not found — ABI compatibility check skipped.',
      fixHint: 'Install Android Build Tools to enable ABI check:\n  sdkmanager "build-tools;34.0.0"\n  Then add build-tools to PATH.'
    };
  }

  // Step 3: Parse native-code ABIs from aapt output
  const abiMatch = aaptOutput.match(/native-code: '([^']+)'/);
  if (!abiMatch) {
    // Pure Java/Kotlin APK — no native library, compatible with all devices
    return {
      name: 'APK ABI Compatibility',
      status: 'pass',
      message: 'APK has no native code — compatible with all devices.'
    };
  }

  const apkAbis = abiMatch[1].split("' '");
  const compatible = apkAbis.some(abi =>
    abi === deviceAbi ||
    (deviceAbi.includes('x86_64') && abi.includes('x86')) ||
    (deviceAbi.includes('arm64') && abi.includes('armeabi'))
  );

  if (!compatible) {
    return {
      name: 'APK ABI Compatibility',
      status: 'fail',
      message: `ABI mismatch: APK supports [${apkAbis.join(', ')}] but device is [${deviceAbi}]`,
      fixHint: `Rebuild your APK with ABI splits:\n  abiFilters '${deviceAbi}'\nOr use a universal APK that includes all ABIs.`
    };
  }

  return {
    name: 'APK ABI Compatibility',
    status: 'pass',
    message: `APK ABI [${apkAbis.join(', ')}] is compatible with device [${deviceAbi}]`
  };
}
```

#### Step 3 — Call `validateApkAbi()` inside `check()`

Find the section inside `check()` that handles the app file check (around line 52):
```typescript
// 5. App file
if (appPath) {
  checks.push(this.checkAppFile(appPath));
}
```

Replace with:
```typescript
// 5. App file + ABI compatibility
if (appPath) {
  checks.push(this.checkAppFile(appPath));
  // ABI check: only for Android APKs
  if ((platform === 'android' || platform === 'both') && appPath.endsWith('.apk')) {
    checks.push(await this.validateApkAbi(appPath));
  }
}
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Confirm `validateApkAbi` uses NO string interpolation for apkPath (search: `\`aapt` — must not exist).
3. Run `check_environment` without aapt installed — must return `warn`, not crash.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `validateApkAbi()` uses `execFileAsync` with args arrays — never `execSync(string)`
- [ ] `aapt` not installed → `warn` status (not crash, not fail)
- [ ] ABI mismatch → `fail` status with clear fix hint
- [ ] ABI match → `pass` status
- [ ] APK without native code → `pass` (compatible with all devices)
- [ ] Change `Status` above to `DONE`
