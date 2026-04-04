# TASK-19 — Propagate codegen Config into Generation Prompt

**Status**: TODO  
**Effort**: Medium (~45 min)  
**Depends on**: TASK-18 (config schema), TASK-12 (read side-effects)  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

TASK-18 added the `codegen` config section and accessor methods.
This task propagates those values into the LLM generation prompt in `TestGenerationService.ts`.

Currently, `generate_cucumber_pom` generates:
- `LoginPage extends BasePage` — regardless of `basePageStrategy`
- `@smoke @regression` tags — regardless of `tagTaxonomy`
- Full feature + steps + page object — regardless of `generateFiles`
- Hardcoded `Page` suffix — regardless of `namingConvention`
- Imports from project-local utils — regardless of `customWrapperPackage`

After this task, all of those adapt to the project's `codegen` config.

Also: `customWrapperPackage` must be persisted in config via `manage_config` and
picked up by `execute_sandbox_code` (`analyze_codebase`) so it isn't counted as "missing" utility.

---

## What to Change

### File 1: `c:\Users\Rohit\mcp\AppForge\src\services\TestGenerationService.ts`

#### Step 1 — Read codegen config at the top of `generateAppiumPrompt()`

Find `generateAppiumPrompt()`. It receives `config: McpConfig`.
At the top of the method, after any existing setup, add:

```typescript
// Read all codegen preferences (with safe defaults)
const configService = new McpConfigService();
const codegen = configService.getCodegen(config);
const suffixStr = codegen.namingConvention.pageObjectSuffix;   // e.g. "Page", "Screen"
const caseStyle = codegen.namingConvention.caseStyle;          // "PascalCase" | "camelCase"
```

#### Step 2 — Build `codegenContext` block and inject into prompt

After reading codegen, build this full context string:

```typescript
// --- BasePage Strategy ---
let basePageBlock = '';
if (codegen.customWrapperPackage) {
  basePageBlock = `
## BASEPAGE / WRAPPER PACKAGE
This project uses "${codegen.customWrapperPackage}" as its Page Object base.
- DO NOT generate BasePage.ts — it comes from the package.
- Import using: import { BasePage } from '${codegen.customWrapperPackage}';
- DO NOT generate ActionUtils.ts, WaitUtils.ts, or any utility already provided by the package.
  Check the package's public API before generating any utility class.
`;
} else if (codegen.basePageStrategy === 'extend') {
  basePageBlock = `
## BASEPAGE STRATEGY: extend (inheritance)
Generated Page Objects must extend BasePage:
  class Login${suffixStr} extends BasePage { ... }
Import: import { BasePage } from '../pages/BasePage.js';
`;
} else if (codegen.basePageStrategy === 'compose') {
  basePageBlock = `
## BASEPAGE STRATEGY: compose (composition, no inheritance)
Generated Page Objects must NOT extend any class.
Instead, accept a driver/utilities instance in the constructor:
  class Login${suffixStr} {
    constructor(private utils: ActionUtils) {}
  }
Import: import { ActionUtils } from '../utils/ActionUtils.js';
`;
} else {
  basePageBlock = `
## BASEPAGE STRATEGY: custom
Follow the existing Page Object file patterns already in the project —
do not impose an inheritance or composition pattern not already present.
`;
}

// --- Naming Convention ---
const namingBlock = `
## NAMING CONVENTION
- Page Object suffix: "${suffixStr}" (e.g. Login${suffixStr}, Home${suffixStr})
- Case style: ${caseStyle} (e.g. ${caseStyle === 'camelCase' ? 'loginPage' : 'Login' + suffixStr})
- File names must match: ${caseStyle === 'camelCase' ? 'login' + suffixStr : 'Login' + suffixStr}.ts
- Step definition files: ${caseStyle === 'camelCase' ? 'login' : 'Login'}.steps.ts
CRITICAL: Use EXACTLY this naming in all class names, file names, and imports.
`;

// --- Tag Taxonomy ---
const tagBlock = codegen.tagTaxonomy.length > 0
  ? `
## TAG TAXONOMY (ONLY use tags from this list)
Valid tags: ${codegen.tagTaxonomy.join(', ')}
Do NOT invent new tags. If a scenario doesn't match any tag, omit tags for that scenario.
`
  : '';

// --- Gherkin Style ---
const gherkinBlock = codegen.gherkinStyle === 'flexible'
  ? `
## GHERKIN STYLE: flexible
Use Gherkin keywords naturally (Given/When/Then/And/But as appropriate).
`
  : `
## GHERKIN STYLE: strict
EVERY scenario must follow strict Given/When/Then structure:
  Given — setup/precondition
  When  — the user action being tested
  Then  — the assertion/expected outcome
Do NOT use consecutive Given/Given or When/When steps.
`;

// --- Generate Files Scope ---
const generateFilesBlock = codegen.generateFiles === 'feature-only'
  ? `
## GENERATE SCOPE: feature file only
Output ONLY the .feature file Gherkin.
Do NOT generate step definitions or Page Objects.
`
  : codegen.generateFiles === 'feature-steps'
  ? `
## GENERATE SCOPE: feature + steps only
Output the .feature file AND step definitions.
Do NOT generate a Page Object class — the team writes those manually.
`
  : `
## GENERATE SCOPE: full stack (default)
Generate: .feature file + step definitions + Page Object class.
`;

// --- Combine all codegen blocks ---
const codegenContext = [
  basePageBlock,
  namingBlock,
  tagBlock,
  gherkinBlock,
  generateFilesBlock
].filter(s => s.trim()).join('\n');
```

#### Step 3 — Inject `codegenContext` into the prompt string

Find where the prompt template string is built. Inject `codegenContext` between the
project summary and the "EXISTING CODE" section:

```typescript
${codegenContext}

## EXISTING CODE (REUSE THESE — DO NOT DUPLICATE)
...
```

---

### File 2: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

#### Step 4 — Update `generate_cucumber_pom` tool description

Find the `generate_cucumber_pom` tool description. Add this sentence at the end:

```
Code generation behavior (BasePage strategy, naming convention, tag taxonomy, file scope,
custom wrapper package) is fully controlled by the "codegen" section of mcp-config.json.
Run manage_config to set preferences before generating.
```

#### Step 5 — Persist `customWrapperPackage` in `execute_sandbox_code` (analyze_codebase path)

Find where `analyze_codebase` is handled in the tool router.
When calling `CodebaseAnalyzerService.analyze()`, pass the `customWrapperPackage` from config:

```typescript
// Read customWrapperPackage from config and pass to analyzer
let customWrapperPackage: string | undefined;
try {
  const cfg = this.configService.read(args.projectRoot);
  const codegen = this.configService.getCodegen(cfg);
  if (codegen.customWrapperPackage) {
    customWrapperPackage = codegen.customWrapperPackage;
  }
} catch { /* config unreadable — proceed without package */ }

// Pass to analyzer (if CodebaseAnalyzerService accepts this param)
const result = await analyzerService.analyze(args.projectRoot, customWrapperPackage);
```

> Note: `CodebaseAnalyzerService.analyze()` already accepts `customWrapperPackage` as a parameter
> in some tools. Verify this is propagated from the config rather than requiring the LLM to pass it.

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Set `codegen.customWrapperPackage: "@myorg/utils"` in a test config.
3. Call `generate_cucumber_pom` — prompt should include "DO NOT generate BasePage.ts" block.
4. Set `codegen.namingConvention.pageObjectSuffix: "Screen"` — generated class name should be `LoginScreen`.
5. Set `codegen.tagTaxonomy: ["@P0", "@P1"]` — generated feature should NOT use `@smoke`.
6. Set `codegen.generateFiles: "feature-only"` — output should contain only the feature file.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `generateAppiumPrompt()` reads codegen from config via `getCodegen()`
- [ ] BasePage strategy block varies based on `basePageStrategy`
- [ ] `customWrapperPackage` triggers "do not generate BasePage/utils" instruction
- [ ] Naming convention (suffix + case) applied to all generated names in prompt
- [ ] Tag taxonomy injected — LLM restricted to valid tags only
- [ ] Gherkin style (strict/flexible) instruction present in prompt
- [ ] `generateFiles` scope instruction present in prompt
- [ ] `execute_sandbox_code` / `analyze_codebase` reads `customWrapperPackage` from config
- [ ] Change `Status` above to `DONE`
