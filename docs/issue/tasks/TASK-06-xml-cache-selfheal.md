# TASK-06 — XML Cache for Self-Heal (Chicken-and-Egg Fix)

**Status**: TODO  
**Effort**: Medium (~40 min)  
**Depends on**: Nothing — standalone change in AppiumSessionService  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

**The chicken-and-egg problem:**

`self_heal_test` requires `xmlHierarchy` as input to find replacement selectors.
To get `xmlHierarchy`, you need a live Appium session and call `inspect_ui_hierarchy`.
But the test just crashed — the session is dead or the app is in an error state.

So the user must:
1. Restart session
2. Manually navigate back to the broken screen
3. Re-fetch the XML
4. Pass it to `self_heal_test`

This is impossible for a QA engineer who is not in a coding environment.

**The fix: Last Known XML Cache**

Every time `inspect_ui_hierarchy` successfully fetches XML from a live session, cache it in memory
in `AppiumSessionService`. When `self_heal_test` is called without `xmlHierarchy`, automatically
use the cached XML from the last successful inspection.

This turns a manual 4-step process into zero steps.

---

## What to Change

### File A: `c:\Users\Rohit\mcp\AppForge\src\services\AppiumSessionService.ts`

#### Step 1 — Add cache field to the class

Find the class definition and its existing private fields. Add:

```typescript
private _lastXmlCache: string | null = null;
private _lastXmlCacheTimestamp: number = 0;
private readonly XML_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
```

#### Step 2 — Add public methods to set and get the cache

Add these methods inside the class:

```typescript
/**
 * Stores the most recently fetched XML page source.
 * Called by ExecutionService after every successful getPageSource() call.
 */
public cacheXml(xml: string): void {
  this._lastXmlCache = xml;
  this._lastXmlCacheTimestamp = Date.now();
}

/**
 * Returns the cached XML if available and not expired.
 * Returns null if cache is empty or older than 5 minutes.
 */
public getCachedXml(): { xml: string; ageSeconds: number } | null {
  if (!this._lastXmlCache) return null;
  const ageMs = Date.now() - this._lastXmlCacheTimestamp;
  if (ageMs > this.XML_CACHE_TTL_MS) return null;
  return { xml: this._lastXmlCache, ageSeconds: Math.round(ageMs / 1000) };
}

/**
 * Clears the XML cache. Call when session ends or app navigates to a new screen.
 */
public clearXmlCache(): void {
  this._lastXmlCache = null;
  this._lastXmlCacheTimestamp = 0;
}
```

#### Step 3 — Clear cache on `endSession()`

Find the `endSession()` or `deleteSession()` method. Add `this.clearXmlCache()` at the start of it.

---

### File B: `c:\Users\Rohit\mcp\AppForge\src\services\ExecutionService.ts`

#### Step 4 — Cache XML after every successful `getPageSource()` call

Find inside `inspectHierarchy()` where `getPageSource()` is called:
```typescript
const xml = await driver.getPageSource();
```

Immediately after this line, add:
```typescript
// Cache the XML for self-heal recovery (chicken-and-egg fix)
AppiumSessionService.instance?.cacheXml(xml);
```

---

### File C: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

#### Step 5 — Auto-inject cached XML in `self_heal_test` handler

Find `case "self_heal_test":` in the tool handler.

Currently it requires `xmlHierarchy` from the caller. Update it to fall back to cache:

```typescript
case "self_heal_test": {
  let xmlHierarchy = args.xmlHierarchy as string | undefined;

  // CHICKEN-AND-EGG FIX: if no XML provided, try cache from last successful inspect
  if (!xmlHierarchy) {
    const cached = AppiumSessionService.instance?.getCachedXml();
    if (cached) {
      xmlHierarchy = cached.xml;
      // Prepend a warning so the LLM knows this XML is from cache
      console.warn(`[self_heal_test] Using cached XML (${cached.ageSeconds}s old). Navigate to the broken screen and re-inspect for fresher data.`);
    }
  }

  if (!xmlHierarchy) {
    return this.textResult(JSON.stringify({
      error: 'HEAL_BLOCKED',
      message: 'No XML hierarchy available. No live session and no cached XML found.',
      suggestion: 'Start a session, navigate to the broken screen, call inspect_ui_hierarchy once, then retry self_heal_test.'
    }));
  }

  const result = await this.executionService.selfHealTest(
    args.testOutput as string,
    xmlHierarchy,
    args.screenshotBase64 as string | undefined
  );
  return this.textResult(JSON.stringify(result, null, 2));
}
```

#### Step 6 — Update `self_heal_test` tool description

Find the description for `self_heal_test`. Replace with:

```typescript
description: `FIX BROKEN TESTS. Use when a test failure says 'element not found / no such element'.
Parses the error and current screen to find the correct replacement selector.

xmlHierarchy is now OPTIONAL — if omitted, uses the cached XML from the last inspect_ui_hierarchy call.
This solves the chicken-and-egg problem where the session dies when the test fails.

Returns: { candidates[]: [{ selector, strategy, confidence, rationale }] }
After getting candidates, update your Page Object with the best selector.`,
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Confirm `AppiumSessionService.instance` is accessible as a static/singleton from `index.ts`.
3. Confirm `cacheXml()` is called in `ExecutionService` after `getPageSource()`.
4. Confirm `self_heal_test` handler returns clear error (not crash) when no XML and no cache.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `AppiumSessionService` has `cacheXml()`, `getCachedXml()`, `clearXmlCache()`
- [ ] `ExecutionService` calls `cacheXml()` after every live `getPageSource()`
- [ ] `self_heal_test` handler auto-uses cache when `xmlHierarchy` arg is absent
- [ ] `self_heal_test` returns clear actionable error when neither arg nor cache is available
- [ ] Cache is cleared on `endSession()`
- [ ] Change `Status` above to `DONE`
