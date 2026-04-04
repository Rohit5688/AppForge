# TASK-03 — Step Hints Filter (Native On-Device Query)

**Status**: TODO  
**Effort**: Medium (~45 min)  
**Depends on**: TASK-01, TASK-02 must be DONE  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

When a user provides test steps like: *"Tap Login button, Enter username, Enter password, Tap Submit"*,
the tool should NOT fetch the full screen hierarchy. Instead it should ask the device to return ONLY
elements matching those keywords — using native Appium on-device queries that run on the device itself,
not in TypeScript.

This avoids transferring 47,000 characters of XML over the wire. The device returns only 3–5 matching elements.

**Android**: `UiSelector().textContains("login")` or `UiSelector().descriptionContains("login")`  
**iOS**: `label CONTAINS[cd] "login"` (NSPredicate, case-insensitive)

The LLM provides `stepHints: ["Tap Login button", "Enter username"]`.
The tool extracts `["login", "username"]` (removes stop words).
The tool runs two native queries (one per keyword), merges results, builds snapshot from merged set.

---

## What to Change

### File: `c:\Users\Rohit\mcp\AppForge\src\services\ExecutionService.ts`

#### Step 1 — Update `inspectHierarchy` signature

Find:
```typescript
public async inspectHierarchy(xmlDump?: string, screenshotBase64?: string)
```

Replace with:
```typescript
public async inspectHierarchy(
  xmlDump?: string,
  screenshotBase64?: string,
  stepHints?: string[]
)
```

#### Step 2 — Add keyword extraction method

Add this private method (place after `buildAccessibilitySnapshot`):

```typescript
/**
 * Extracts actionable keywords from natural-language step descriptions.
 * Input:  ["Tap the Login button", "Enter username in the field"]
 * Output: ["login", "username"]
 *
 * Strategy: remove Gherkin keywords, common verbs, articles, prepositions.
 * Keep nouns/adjectives — these are the element labels on screen.
 */
private extractStepKeywords(steps: string[]): string[] {
  const STOP_WORDS = new Set([
    'given','when','then','and','but','i','the','a','an','to','on','in',
    'at','by','for','with','from','into','tap','click','press','enter',
    'type','input','verify','check','see','confirm','navigate','go',
    'open','close','select','choose','scroll','swipe','should','is',
    'am','are','be','been','have','has','had','do','does','did','will',
    'would','could','should','may','might','must','shall','can','need',
    'field','button','screen','page','view','bar','icon','text','label',
    'this','that','these','those','my','your','its','their','our'
  ]);

  return [
    ...new Set(
      steps.flatMap(step =>
        step
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length > 2 && !STOP_WORDS.has(word))
      )
    )
  ];
}
```

#### Step 3 — Add native query method

Add this private method (after `extractStepKeywords`):

```typescript
/**
 * Runs native on-device queries to find elements by keyword.
 * Returns raw elements directly from the device — no full page source needed.
 *
 * Android: Uses UiSelector textContains + descriptionContains
 * iOS: Uses NSPredicate label CONTAINS[cd]
 *
 * Falls back to full XML if no native session is available (xmlDump mode).
 */
private async findElementsByKeywords(
  keywords: string[],
  platform: 'android' | 'ios' | 'both'
): Promise<{ locator: string; text: string; tag: string }[]> {
  const session = AppiumSessionService.instance;
  if (!session?.isConnected()) return [];

  const driver = session.getDriver();
  if (!driver) return [];

  const results: { locator: string; text: string; tag: string }[] = [];

  for (const kw of keywords) {
    try {
      if (platform === 'ios') {
        // iOS NSPredicate: partial match, case-insensitive
        const predicate = `label CONTAINS[cd] "${kw}" OR name CONTAINS[cd] "${kw}" OR value CONTAINS[cd] "${kw}"`;
        const els = await driver.$$(
          `-ios predicate string:${predicate}`
        );
        for (const el of els.slice(0, 5)) {
          const label = await el.getAttribute('label') ?? '';
          const name = await el.getAttribute('name') ?? '';
          const tag = await el.getAttribute('type') ?? 'XCUIElementTypeOther';
          const locator = name ? `~${name}` : `label:${label}`;
          if (label || name) results.push({ locator, text: label || name, tag });
        }
      } else {
        // Android UiSelector: textContains OR descriptionContains
        const textSelector = `new UiSelector().textContains("${kw}")`;
        const descSelector = `new UiSelector().descriptionContains("${kw}")`;
        for (const sel of [textSelector, descSelector]) {
          try {
            const els = await driver.$$(`android=${sel}`);
            for (const el of els.slice(0, 5)) {
              const text = await el.getText() ?? '';
              const desc = await el.getAttribute('content-desc') ?? '';
              const resId = await el.getAttribute('resource-id') ?? '';
              const tag = await el.getAttribute('class') ?? 'android.view.View';
              const locator = desc ? `~${desc}` : resId ? `id=${resId}` : text ? `text=${text}` : '';
              if (locator) results.push({ locator, text: text || desc, tag });
            }
          } catch { /* element not found for this selector — continue */ }
        }
      }
    } catch {
      // Keyword not found on screen — skip silently, continue with next keyword
    }
  }

  // Deduplicate by locator
  return [...new Map(results.map(r => [r.locator, r])).values()];
}
```

#### Step 4 — Wire `stepHints` into `inspectHierarchy`

Inside `inspectHierarchy`, BEFORE the full `getPageSource()` call, add:

```typescript
// FAST PATH: If stepHints provided, try native on-device query first
if (stepHints && stepHints.length > 0 && !xmlDump) {
  const keywords = this.extractStepKeywords(stepHints);
  const platform = AppiumSessionService.instance?.getPlatform() ?? 'android';
  const nativeElements = await this.findElementsByKeywords(keywords, platform as any);

  if (nativeElements.length > 0) {
    const snapshotLines = [
      `[Screen: live | stepHints filter: "${keywords.join(', ')}" | timestamp: ${new Date().toLocaleTimeString()}]`,
      `Found ${nativeElements.length} matching elements (native on-device query — no full XML fetched)`,
      '',
      ...nativeElements.map((el, i) => {
        const role = el.tag.split('.').pop() ?? 'element';
        return `#${i + 1}  ${role.padEnd(10)} "${el.text.substring(0, 40).padEnd(40)}"   ${el.locator}`;
      }),
      '',
      'These elements were found using on-device queries — zero XML transferred.',
      'LOCATOR PRIORITY: Use the locator shown above directly in your Page Object.'
    ];

    return {
      snapshot: snapshotLines.join('\n'),
      elementCount: { total: nativeElements.length, interactive: nativeElements.length },
      timestamp: new Date().toISOString(),
      source: 'live_session'
    };
  }
  // If native query returned 0 results, fall through to full XML snapshot below
}
```

#### Step 5 — Wire `stepHints` into `index.ts` handler

In `index.ts`, update the `case "inspect_ui_hierarchy":` handler:

```typescript
case "inspect_ui_hierarchy": {
  const result = await this.executionService.inspectHierarchy(
    args.xmlDump as string | undefined,
    args.screenshotBase64 as string | undefined,
    args.stepHints as string[] | undefined   // NEW
  );
  // ... rest of handler unchanged
}
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Verify `extractStepKeywords(["Tap the Login button"])` → returns `["login"]` (manual trace through stop words).
3. Verify method signature matches what `index.ts` handler passes.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `inspectHierarchy` accepts `stepHints?: string[]`
- [ ] `extractStepKeywords` strips stop words correctly
- [ ] `findElementsByKeywords` runs native query for Android and iOS
- [ ] Fast path exits early (no XML fetch) when native query returns results
- [ ] Falls through to full XML snapshot if native query returns 0 results (resilient)
- [ ] Change `Status` above to `DONE`
