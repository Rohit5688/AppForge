# TASK-13 — start_appium_session: Remove iOS bundleId Questioner Loop

**Status**: DONE  
**Effort**: Small (~15 min)  
**Depends on**: Nothing — standalone  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

`start_appium_session` forces `noReset: true` before calling `resolveCapabilities()`.
This was intended to prevent the Questioner from firing — but it only partially works.

The handler sets `noReset: true` on the profile, which avoids the **first** Questioner call
(which checks for missing `appium:app`). However, a **second** `Questioner.clarify()` call
exists for iOS sessions without a `bundleId`:

```typescript
// Still fires even with noReset:true
if (caps.platformName?.toLowerCase() === 'ios' && caps['appium:noReset'] && !caps['appium:bundleId']...) {
  Questioner.clarify("iOS bundleId missing...", ...);
}
```

When this fires, the tool returns `CLARIFICATION_REQUIRED` and enters an infinite loop because
the LLM calls `start_appium_session` again without knowing what bundleId to provide.

**File**: `c:\Users\Rohit\mcp\AppForge\src\services\AppiumSessionService.ts`

---

## What to Change

#### Step 1 — Find the iOS bundleId Questioner call

Search in `AppiumSessionService.ts` for:
```
Questioner.clarify
```

There will be one or more calls. Find the one that fires for iOS sessions — it will check
for `platformName === 'ios'` and missing `bundleId` (or similar iOS-specific condition).

It will look approximately like:
```typescript
if (caps.platformName?.toLowerCase() === 'ios' && !caps['appium:bundleId'] && !caps['appium:app']) {
  Questioner.clarify(...)
}
```
or:
```typescript
if (platformName === 'ios' && caps['appium:noReset'] && !caps['appium:bundleId']) {
  throw new ClarificationRequired(...)
}
```

#### Step 2 — Replace the Questioner call with a console.warn

Delete that entire `if` block (the `Questioner.clarify(...)` or `ClarificationRequired` throw).

Replace it with a non-blocking log:
```typescript
// REMOVED: Questioner.clarify for missing iOS bundleId.
// noReset:true is forced at session start, so Appium will attach to the running app
// without needing bundleId. If the session fails, Appium will produce a native error
// with a clear message — no need to halt with CLARIFICATION_REQUIRED.
console.warn('[AppForge] iOS bundleId not set — relying on Appium noReset:true to attach to running app.');
```

#### Step 3 — Verify no other Questioner calls remain in the session startup path

After the change, search for all remaining `Questioner.clarify` or `ClarificationRequired` calls
in `AppiumSessionService.ts`. For each one found, confirm it is:
- Not in the `startSession()` or `resolveCapabilities()` code path, OR
- If it is, replace it with a `console.warn` the same way as Step 2.

The goal: `startSession()` must never throw `ClarificationRequired`. It may throw `Error` or
`AppForgeError` (which the handler catches and returns as a structured error), but never a
Questioner-triggered halt.

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Search `AppiumSessionService.ts` for `Questioner.clarify` — the iOS-specific one must be gone.
3. Search for `ClarificationRequired` throws inside `startSession()` call path — must be zero.

---

## Done Criteria
- [x] `npm run build` passes with zero errors
- [x] iOS bundleId `Questioner.clarify` call removed from `AppiumSessionService`
- [x] Replaced with `console.warn` (non-blocking)
- [x] `startSession()` path contains zero `throw new ClarificationRequired(...)` calls
- [x] Change `Status` above to `DONE`
