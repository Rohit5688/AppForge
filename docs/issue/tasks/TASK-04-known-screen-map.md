# TASK-04 — Known Screen Locator Block in Generation Prompt

**Status**: TODO  
**Effort**: Medium (~45 min)  
**Depends on**: Nothing — pure prompt change, no dependency on Tasks 1–3  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

**The problem this solves:**

When a user says *"Login to the app, reach Dashboard, then test the Add to Cart flow"*, the LLM calls
`inspect_ui_hierarchy` for EVERY screen it navigates through — including Login, Home, Dashboard — even
though all of those screens already have Page Objects with known locators in the codebase.

By screen 3 or 4, the context is full. The Cart screen (the NEW screen being tested) never gets inspected.

**The fix:**

In `TestGenerationService.generateAppiumPrompt()`, automatically build a **"Known Screen Locator Block"**
from the `existingPageObjects[]` array that is ALREADY passed to this method via codebase analysis.

This block tells the LLM exactly which screens to SKIP during live inspection, and which screen is NEW
and needs inspection. The LLM then uses `inspect_ui_hierarchy` only for the new screen.

---

## What to Change

### File: `c:\Users\Rohit\mcp\AppForge\src\services\TestGenerationService.ts`

#### Step 1 — Add `buildKnownScreenMap()` private method

Add this new private method at the bottom of the `TestGenerationService` class (before the closing `}`):

```typescript
/**
 * Builds a "Known Screen Locator Block" from existing page objects.
 * Injected into the generation prompt to prevent the LLM from calling
 * inspect_ui_hierarchy for screens that already have Page Objects.
 *
 * The LLM reads this block and knows:
 *   ✅ These screens = use existing Page Object methods. NO inspect call.
 *   ❌ Screens NOT listed = new screens. Call inspect_ui_hierarchy.
 */
private buildKnownScreenMap(
  existingPageObjects: { path: string; publicMethods: string[] }[]
): string {
  if (!existingPageObjects || existingPageObjects.length === 0) {
    return ''; // No existing pages — all screens are new, inspect everything
  }

  const screenLines = existingPageObjects.map(po => {
    const className = po.path.split('/').pop()?.replace('.ts', '') ?? po.path;
    const methods = po.publicMethods.length > 0
      ? po.publicMethods.slice(0, 6).map(m => `   ${m}()`).join('\n')
      : '   (no public methods detected)';
    return `✅ ${className} (${po.path})\n${methods}`;
  });

  return `
## 🧠 KNOWN SCREEN LOCATORS — DO NOT RE-INSPECT THESE SCREENS

The following screens have existing Page Objects with known locators and methods.
For any navigation step that passes through these screens, use their existing methods.
🚫 DO NOT call inspect_ui_hierarchy for any screen listed below.

${screenLines.join('\n\n')}

❌ Any screen NOT listed above has no Page Object yet.
   → Call inspect_ui_hierarchy ONLY for that new screen.
   → Use stepHints=[...steps for that screen] when calling inspect_ui_hierarchy.

NAVIGATION RULE:
If the user says "login to app" → use the login Page Object's login method in Background:
If the user says "reach [Screen]" → use that Screen's navigation method if it exists above.
If the user says "reach [Screen]" and it's NOT listed → it's new, call inspect_ui_hierarchy.

BACKGROUND PATTERN (use when user describes a pre-condition like "login first"):
\`\`\`gherkin
Background:
  Given I am logged in as a standard user
\`\`\`
Map this to the login Page Object's method. Do NOT generate new login locators.
`;
}
```

#### Step 2 — Call `buildKnownScreenMap()` inside `generateAppiumPrompt()`

Find the existing `generateAppiumPrompt()` method. It currently has sections for:
- `existingStepsSummary`
- `existingPagesSummary`
- `existingUtilsSummary`

After the `existingPagesSummary` assignment, add:

```typescript
const knownScreenMap = this.buildKnownScreenMap(analysis.existingPageObjects);
```

#### Step 3 — Inject `knownScreenMap` into the prompt string

Find the section in `generateAppiumPrompt()` that says:
```
## EXISTING CODE (REUSE THESE -- DO NOT DUPLICATE)
```

Add `knownScreenMap` IMMEDIATELY AFTER the conflicts warning and BEFORE the existing steps section:

```typescript
${conflictsWarning}
${aliasesWarning}
${knownScreenMap}
### Existing Step Definitions:
${existingStepsSummary}
```

This ensures the LLM reads the "DO NOT RE-INSPECT" map BEFORE seeing the list of steps.

---

## Example of Injected Output

For a project with LoginPage, HomePage, DashboardPage, the injected block looks like:

```
## 🧠 KNOWN SCREEN LOCATORS — DO NOT RE-INSPECT THESE SCREENS

✅ LoginPage (pages/LoginPage.ts)
   login()
   enterUsername()
   enterPassword()
   tapLoginButton()

✅ HomePage (pages/HomePage.ts)
   navigateToDashboard()
   navigateToProducts()

✅ DashboardPage (pages/DashboardPage.ts)
   tapAddToCart()
   getCartCount()

❌ Any screen NOT listed above has no Page Object yet.
   → Call inspect_ui_hierarchy ONLY for that new screen.
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Trace: `buildKnownScreenMap([])` should return `''` (empty string — no injection when no pages exist).  
3. Trace: `buildKnownScreenMap([{ path: 'pages/LoginPage.ts', publicMethods: ['login', 'logout'] }])` should return a string containing `✅ LoginPage` and `login()`.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `buildKnownScreenMap()` private method added to `TestGenerationService`
- [ ] Method returns empty string when no existing page objects
- [ ] `knownScreenMap` is injected into the prompt BEFORE the steps summary
- [ ] Test: method output contains `✅` entries and `❌ Any screen NOT listed` notice
- [ ] Change `Status` above to `DONE`
