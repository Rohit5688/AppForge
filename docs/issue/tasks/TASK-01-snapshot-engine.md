# TASK-01 — Mobile Accessibility Snapshot Engine

**Status**: TODO  
**Effort**: Medium (~60 min)  
**Depends on**: Nothing — first task, standalone  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

`inspect_ui_hierarchy` in AppForge currently returns the full raw Appium XML string to the LLM.
A typical screen produces 15,000–50,000 tokens of XML. This floods the LLM context, leaving no room for actual test generation work.

The fix: replace the raw XML response with a **Mobile Accessibility Snapshot** — a compact plain-text list of only interactive elements, modeled on how Playwright MCP returns an ARIA snapshot instead of raw HTML.

**Target token reduction**: From ~15,000 tokens → ~150 tokens per inspect call.

---

## What to Change

### File: `c:\Users\Rohit\mcp\AppForge\src\services\ExecutionService.ts`

#### Step 1 — Update the `inspectHierarchy` return type

Find this block (around line 273):
```typescript
public async inspectHierarchy(xmlDump?: string, screenshotBase64?: string): Promise<{
  xml: string;
  screenshot: string;
  timestamp: string;
  elements: ParsedElement[];
  source: 'provided' | 'live_session';
}>
```

Replace the return type with:
```typescript
public async inspectHierarchy(xmlDump?: string, screenshotBase64?: string): Promise<{
  snapshot: string;
  elementCount: { total: number; interactive: number };
  timestamp: string;
  source: 'provided' | 'live_session';
  xml?: string;  // only populated in full mode (for healer tools)
}>
```

#### Step 2 — Update the return value inside `inspectHierarchy`

Find the current return block (around line 299):
```typescript
return {
  xml,
  screenshot,
  timestamp: new Date().toISOString(),
  elements,
  source
};
```

Replace with:
```typescript
const elements = this.parseXmlElements(xml);
const snapshot = this.buildAccessibilitySnapshot(elements, source);

return {
  snapshot,
  elementCount: { total: elements.length, interactive: elements.filter(e => e.locatorStrategies.length > 0).length },
  timestamp: new Date().toISOString(),
  source,
  // Raw XML only for healer tools that explicitly need it
  xml: xmlDump ? xml : undefined
};
```

#### Step 3 — Add `buildAccessibilitySnapshot()` private method

Add this new private method AFTER the `parseXmlElements()` method (around line 419):

```typescript
/**
 * Builds a compact Mobile Accessibility Snapshot from parsed elements.
 * Modeled on Playwright MCP's ARIA snapshot — returns only interactive elements
 * in a human-readable format the LLM can process in ~150 tokens.
 *
 * Format per element:
 *   #ref  role  "visible label"   best_locator   [states]
 */
private buildAccessibilitySnapshot(elements: ParsedElement[], source: string): string {
  const interactive = elements.filter(el =>
    el.locatorStrategies.length > 0 &&
    (el.text || el.contentDesc || el.resourceId)
  );

  if (interactive.length === 0) {
    return `[Screen: ${source} | No interactive elements found — screen may still be loading]`;
  }

  const roleMap: Record<string, string> = {
    'android.widget.Button': 'button',
    'android.widget.EditText': 'input',
    'android.widget.TextView': 'text',
    'android.widget.ImageButton': 'button',
    'android.widget.CheckBox': 'checkbox',
    'android.widget.Switch': 'toggle',
    'android.widget.RadioButton': 'radio',
    'android.widget.ImageView': 'image',
    'XCUIElementTypeButton': 'button',
    'XCUIElementTypeTextField': 'input',
    'XCUIElementTypeSecureTextField': 'input',
    'XCUIElementTypeStaticText': 'text',
    'XCUIElementTypeSwitch': 'toggle',
  };

  const lines: string[] = [
    `[Screen: ${source} | timestamp: ${new Date().toLocaleTimeString()}]`,
    `Interactive elements: ${interactive.length} of ${elements.length} total`,
    ''
  ];

  interactive.forEach((el, i) => {
    const ref = `#${i + 1}`;
    const role = roleMap[el.tag] ?? el.tag.split('.').pop() ?? 'element';
    const label = el.text || el.contentDesc || el.id || '(no label)';
    const bestLocator = el.locatorStrategies[0] ?? 'no-locator';
    const states: string[] = [];
    if (el.tag.includes('EditText') || el.tag.includes('TextField')) states.push('editable');
    if (el.tag.includes('SecureTextField') || el.contentDesc?.toLowerCase().includes('password')) states.push('secure');

    const stateStr = states.length > 0 ? `[${states.join(', ')}]` : '[clickable]';
    lines.push(`${ref.padEnd(4)} ${role.padEnd(10)} "${label.substring(0, 40).padEnd(40)}"   ${bestLocator.padEnd(35)} ${stateStr}`);
  });

  lines.push('');
  lines.push('LOCATOR PRIORITY: Use accessibility-id (~) → resource-id (id=) → xpath as last resort.');
  lines.push('USE #ref number to reference elements in your Page Object locators.');

  return lines.join('\n');
}
```

---

## Verification

1. Run `npm run build` — must produce zero TypeScript errors.
2. Search for any callers of `inspectHierarchy` that destructure `{ xml, elements }` — update them to use `{ snapshot }` instead.
   - Known caller: `index.ts` case `"inspect_ui_hierarchy"` (line ~588)
   - Known caller: any test files in `src/tests/`

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `inspectHierarchy` returns `snapshot` string instead of `xml` + `elements[]`
- [ ] Raw `xml` is only returned when `xmlDump` was explicitly passed by caller
- [ ] Change `Status` above to `DONE`
