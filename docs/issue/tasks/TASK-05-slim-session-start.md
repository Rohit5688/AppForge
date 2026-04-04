# TASK-05 — Slim Session Startup + Navigation Shortcut Hints

**Status**: TODO  
**Effort**: Small (~25 min)  
**Depends on**: Nothing — standalone change  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Two related problems fixed in one small task:

**Problem A — Session startup fetches unnecessary XML:**  
`start_appium_session` currently calls `getPageSource()` to count elements for the `elementsFound` field.
This is a wasted XML fetch at connect time — the session just started, no work is happening yet.
Remove this and return only the session metadata the LLM actually needs.

**Problem B — LLM doesn't know about navigation shortcuts:**  
When the LLM connects to a device, it doesn't know that:
- Android apps can jump directly to any screen via `startActivity`
- Both platforms support `openDeepLink(url)` from BasePage

So the LLM navigates through the UI step by step, calling `inspect_ui_hierarchy` on every intermediate screen.
Adding navigation hints to the session start response tells the LLM immediately what shortcuts exist.

---

## What to Change

### File A: `c:\Users\Rohit\mcp\AppForge\src\services\AppiumSessionService.ts`

#### Change 1 — Remove `getPageSource()` from `startSession()`

Find in `startSession()`:
```typescript
const pageSource = await this.driver.getPageSource();
const elementCount = (pageSource.match(/<[^/][^>]*>/g) ?? []).length;
```
(or similar logic that counts elements from page source at session start)

**Delete these lines entirely.** Do not replace them.

#### Change 2 — Update `startSession()` return value

Find where `elementsFound` or similar is returned. Replace with navigation hints:

```typescript
return {
  sessionId: this.driver.sessionId,
  platform: resolvedPlatform,
  device: caps['appium:deviceName'] ?? 'unknown',
  appPackage: caps['appium:appPackage'] ?? caps['appium:bundleId'] ?? 'unknown',
  navigationHints: {
    deepLinkAvailable: !!(caps['appium:appPackage'] || caps['appium:bundleId']),
    androidPackage: caps['appium:appPackage'] ?? null,
    androidDefaultActivity: caps['appium:appActivity'] ?? null,
    iosBundle: caps['appium:bundleId'] ?? null,
    shortcutNote: 'Use openDeepLink(url) from BasePage to jump directly to any deep-linked screen. For Android, use startActivity(package, activity) to open any Activity directly without UI navigation.'
  }
};
```

---

### File B: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

#### Change 3 — Update `start_appium_session` tool description

Find the `description` for `start_appium_session`. Replace with:

```typescript
description: `CONNECT TO DEVICE. Starts a live Appium session on the device configured in mcp-config.json.
The app must already be installed on the device. Use noReset:true (auto-applied).

Returns: { sessionId, platform, device, appPackage, navigationHints }

navigationHints tells you how to navigate WITHOUT calling inspect_ui_hierarchy on every screen:
  • openDeepLink(url) — jump directly to any deep-linked screen (fastest)
  • startActivity(package, activity) — Android: jump to any Activity directly
  • Use these instead of tapping through intermediate screens

After connecting:
✅ Call inspect_ui_hierarchy with stepHints=[...your new steps] for NEW screens only.
🚫 DO NOT call inspect_ui_hierarchy for screens that already have Page Objects.`,
```

#### Change 4 — Update the session start handler response

Find `case "start_appium_session":` (or equivalent) in the handler.

Ensure the response text highlights navigation hints:
```typescript
case "start_appium_session": {
  const result = await this.appiumSessionService.startSession(args as any);
  const hints = result.navigationHints;
  const output = [
    `✅ Session started | Device: ${result.device} | Platform: ${result.platform}`,
    `App: ${result.appPackage}`,
    '',
    '📍 Navigation Shortcuts Available:',
    hints.androidPackage ? `  Android startActivity: package=${hints.androidPackage}, activity=${hints.androidDefaultActivity}` : '',
    hints.iosBundle ? `  iOS bundle: ${hints.iosBundle}` : '',
    `  Deep links: openDeepLink(url) — use for any screen with a deep link`,
    '',
    'Next: Call inspect_ui_hierarchy with stepHints=[...your steps] for the NEW screen you are building.',
    '🚫 Do NOT call inspect_ui_hierarchy for screens that already have Page Objects.'
  ].filter(Boolean).join('\n');
  return this.textResult(output);
}
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Confirm `elementsFound` is fully removed from the return type of `startSession()`.
3. Confirm `navigationHints` is returned and accessible in the handler.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `getPageSource()` call during session startup is removed
- [ ] `startSession()` returns `navigationHints` with package/activity/deeplink info
- [ ] Tool description has navigation shortcut guidance
- [ ] Handler response text includes the navigation shortcut hints
- [ ] Change `Status` above to `DONE`
