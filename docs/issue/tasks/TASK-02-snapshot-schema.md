# TASK-02 — Update inspect_ui_hierarchy Tool Schema & Description

**Status**: TODO  
**Effort**: Small (~20 min)  
**Depends on**: TASK-01 must be DONE (snapshot field must exist before schema update)  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

`inspect_ui_hierarchy` in AppForge now returns a `snapshot` string (compact plain-text list of interactive elements)
instead of raw XML. This task updates the MCP tool schema and description in `index.ts` to reflect this change.

The tool description is what the LLM reads to decide WHEN and HOW to call this tool. The current description
encourages the LLM to call it for every screen. The update will add explicit "DO NOT CALL" guards to prevent
the LLM from wasting context on screens that already have Page Objects.

---

## What to Change

### File: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

#### Step 1 — Update the tool description

Search for the string `"inspect_ui_hierarchy"` in `index.ts`. Find the `description` field of this tool.

Replace the entire current description with:

```typescript
description: `SEE WHAT'S ON SCREEN. Returns a compact Mobile Accessibility Snapshot of interactive elements.
⚡ REQUIRES ACTIVE SESSION — call start_appium_session first. Exception: pass xmlDump for offline parsing.

🚫 DO NOT CALL if the screen's Page Object already exists in the project.
   → Check existingPageObjects from execute_sandbox_code first.
   → If the screen exists → use its locators directly. Skip this call entirely.
✅ ONLY CALL for screens with NO existing Page Object (new screens you are building).
✅ CALL with stepHints=[...your step strings] to get snapshot filtered to relevant elements only.

Returns: { snapshot: compact plain-text element list with #ref IDs and best locators, elementCount: { total, interactive }, source, timestamp }
Use #ref numbers and locators from snapshot to build Page Object selectors.
The snapshot shows: role, visible label, best locator strategy, interaction states.`,
```

#### Step 2 — Update `inputSchema` properties

Find the `inputSchema` for `inspect_ui_hierarchy`. Currently it has:
- `xmlDump`
- `screenshotBase64`

Add the new `stepHints` property (even though the filter logic comes in TASK-03, the schema needs it registered now):

```typescript
stepHints: {
  type: "array",
  items: { type: "string" },
  description: "Array of step strings the user described (e.g. ['Tap Login button', 'Enter username']). The tool extracts keywords and returns only matched elements. Reduces tokens by 80–95% vs full snapshot. Use when you know which steps need locators."
},
```

#### Step 3 — Update the handler response

Find the `case "inspect_ui_hierarchy":` block in the tool call handler (in the `CallToolRequestSchema` switch).

Currently it likely does something like:
```typescript
return this.textResult(JSON.stringify(result, null, 2));
```

Update to format the snapshot prominently at the top of the response:
```typescript
case "inspect_ui_hierarchy": {
  const result = await this.executionService.inspectHierarchy(
    args.xmlDump as string | undefined,
    args.screenshotBase64 as string | undefined
  );
  // Snapshot is plain text — return it directly, not wrapped in JSON
  // This avoids the LLM having to parse JSON to find the snapshot
  const output = [
    result.snapshot,
    '',
    `Elements: ${result.elementCount.interactive} interactive of ${result.elementCount.total} total`,
    `Source: ${result.source} | ${result.timestamp}`,
  ].join('\n');
  return this.textResult(output);
}
```

---

## Verification

1. Run `npm run build` — must produce zero TypeScript errors.
2. Confirm there are no references to `result.xml` or `result.elements` in this handler (TASK-01 removed those).

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] Tool description has the 🚫 DO NOT CALL guard
- [ ] `stepHints` array param is registered in inputSchema
- [ ] Handler returns snapshot as readable plain text, not nested JSON
- [ ] Change `Status` above to `DONE`
