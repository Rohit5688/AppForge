# TASK-18 — Config Schema Expansion: codegen, timeouts, reporting, selfHeal, tsconfigPath

**Status**: TODO  
**Effort**: Small (~30 min)  
**Depends on**: TASK-11 (deep merge), TASK-12 (read side-effects) — do those first  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

This task adds four new optional top-level sections to the `McpConfig` interface.
These fields are then injected into `scaffoldMcpConfig()` as scaffold defaults and into
the `manage_config` operation schema. The actual **use** of these fields in generation
is handled in TASK-19 and TASK-20.

This task's scope is intentionally narrow: **only schema changes + scaffold defaults**.

---

## Sections Being Added

```json
{
  "codegen": {
    "customWrapperPackage": null,
    "basePageStrategy": "extend",
    "namingConvention": { "pageObjectSuffix": "Page", "caseStyle": "PascalCase" },
    "gherkinStyle": "strict",
    "tagTaxonomy": ["@smoke", "@regression"],
    "generateFiles": "full"
  },
  "timeouts": {
    "elementWait": 10000,
    "scenarioTimeout": 60000,
    "connectionRetry": 120000,
    "connectionRetryCount": 3,
    "appiumPort": 4723,
    "xmlCacheTtlMinutes": 5
  },
  "selfHeal": {
    "confidenceThreshold": 0.7,
    "maxCandidates": 3,
    "autoApply": false
  },
  "reporting": {
    "format": "html",
    "outputDir": "reports",
    "screenshotOn": "failure"
  },
  "tsconfigPath": null
}
```

> **`tsconfigPath`** is a top-level string field (not nested). When set, it is passed as
> `--tsconfig <path>` to any TypeScript compilation step (e.g. `SandboxEngine`, `validate_and_write`).
> User sets this explicitly — no auto-detection. If not set (`null`), no flag is passed and the
> runner uses its default tsconfig resolution.

---

## What to Change

### File 1: `c:\Users\Rohit\mcp\AppForge\src\services\McpConfigService.ts`

#### Step 1 — Add new interfaces before `McpConfig`

Add these TypeScript interfaces/types BEFORE the `McpConfig` interface declaration:

```typescript
export interface CodegenConfig {
  /**
   * If your team has a shared base Page Object package (e.g., '@myorg/test-utils'),
   * set this. AppForge will import from it instead of generating BasePage.ts.
   */
  customWrapperPackage?: string | null;

  /**
   * How generated Page Objects inherit from BasePage.
   * "extend" = class LoginPage extends BasePage (default)
   * "compose" = BasePage methods injected, no class inheritance
   * "custom" = LLM uses your existing pattern
   */
  basePageStrategy?: 'extend' | 'compose' | 'custom';

  namingConvention?: {
    /**
     * Suffix for generated Page Object files/classes.
     * "Page" → LoginPage.ts | "Screen" → LoginScreen.ts
     */
    pageObjectSuffix?: 'Page' | 'Screen' | 'Component' | 'Flow';
    /** "PascalCase" → LoginPage | "camelCase" → loginPage */
    caseStyle?: 'PascalCase' | 'camelCase';
  };

  /**
   * "strict" = enforce Given/When/Then in feature files
   * "flexible" = LLM uses best judgment on step keywords
   */
  gherkinStyle?: 'strict' | 'flexible';

  /**
   * Valid tags for this project. LLM will only use tags from this list.
   * Match your test management system (Jira Xray, TestRail, etc.) tag names.
   */
  tagTaxonomy?: string[];

  /**
   * Which files to generate in generate_cucumber_pom.
   * "full" = feature + steps + page object (default)
   * "feature-steps" = feature + steps only (you write page objects)
   * "feature-only" = only the Gherkin feature file
   */
  generateFiles?: 'full' | 'feature-steps' | 'feature-only';
}

export interface TimeoutsConfig {
  /** Default wait for elements in ActionUtils/WaitUtils (ms). Default: 10000 */
  elementWait?: number;
  /** Cucumber scenario timeout (ms). Default: 60000 */
  scenarioTimeout?: number;
  /** WebdriverIO connection retry timeout (ms). Default: 120000 */
  connectionRetry?: number;
  /** WebdriverIO connection retry count. Default: 3 */
  connectionRetryCount?: number;
  /** Appium server port. Default: 4723 */
  appiumPort?: number;
  /** How long to cache page XML from inspect_ui (minutes). Default: 5 */
  xmlCacheTtlMinutes?: number;
}

export interface SelfHealConfig {
  /** Minimum confidence (0.0–1.0) to include a selector candidate. Default: 0.7 */
  confidenceThreshold?: number;
  /** How many replacement candidates to show. Default: 3 */
  maxCandidates?: number;
  /** If true, auto-apply the highest-confidence candidate. Default: false */
  autoApply?: boolean;
}

export interface ReportingConfig {
  /** Report format. Default: "html" */
  format?: 'html' | 'allure' | 'junit' | 'none';
  /** Output directory for reports. Default: "reports" */
  outputDir?: string;
  /** When to capture screenshots. Default: "failure" */
  screenshotOn?: 'failure' | 'always' | 'never';
}
```

#### Step 2 — Add fields to `McpConfig` interface

In the `McpConfig` interface, after `activeBuild?: string;`, add:

```typescript
  /** Code generation style preferences. See docs/MCP_CONFIG_REFERENCE.md for details. */
  codegen?: CodegenConfig;

  /** Timeout values used in generated test files and tools. */
  timeouts?: TimeoutsConfig;

  /** Self-healing selector behavior. */
  selfHeal?: SelfHealConfig;

  /** Test reporting format and behavior. */
  reporting?: ReportingConfig;

  /**
   * Relative path to the TypeScript config file for this project.
   * When set, this path is ALWAYS passed as `--tsconfig <path>` to TypeScript
   * compilation steps (SandboxEngine, validate_and_write).
   * User-supplied — no auto-detection. Leave null to use runner defaults.
   * Example: "tsconfig.json" | "config/tsconfig.test.json"
   */
  tsconfigPath?: string | null;

  /**
   * Project-specific config files that AppForge tools should read and inject
   * into their LLM context during planning, generation, and healing.
   *
   * Each entry: the tool reads the file, parses it, prepends it to the prompt.
   * Tools ONLY read files whose operation name is in `injectInto`.
   *
   * Use for: device capability overrides YAML, feature flags, remote config files.
   * Use `repoContext` for: static team conventions, architecture decisions.
   *
   * See TestForge docs/issues/project-extensions-design.md for full design.
   */
  projectExtensions?: Array<{
    name: string;
    description: string;           // MANDATORY — LLM instruction on how to use this file
    path: string;                  // relative to projectRoot
    format?: 'yaml' | 'json' | 'text' | 'env';
    injectInto: Array<'generate' | 'analyze' | 'heal' | 'run' | 'check'>;
    maxLines?: number;             // for text/log files, default 100
    required?: boolean;            // check_environment FAILs if missing, default false
  }>;

```

> `environments`, `currentEnvironment`, and `credentials` are added in TASK-17.
> Add them if TASK-17 is already done, otherwise they will be added then.

#### Step 3 — Add accessor helpers to `McpConfigService`

Add these public methods after `getPaths()`:

```typescript
/** Returns codegen config with safe defaults. */
public getCodegen(config: McpConfig): Required<CodegenConfig> {
  return {
    customWrapperPackage: config.codegen?.customWrapperPackage ?? null,
    basePageStrategy: config.codegen?.basePageStrategy ?? 'extend',
    namingConvention: {
      pageObjectSuffix: config.codegen?.namingConvention?.pageObjectSuffix ?? 'Page',
      caseStyle: config.codegen?.namingConvention?.caseStyle ?? 'PascalCase'
    },
    gherkinStyle: config.codegen?.gherkinStyle ?? 'strict',
    tagTaxonomy: config.codegen?.tagTaxonomy ?? ['@smoke', '@regression'],
    generateFiles: config.codegen?.generateFiles ?? 'full'
  };
}

/** Returns timeout values with safe defaults. */
public getTimeouts(config: McpConfig): Required<TimeoutsConfig> {
  return {
    elementWait: config.timeouts?.elementWait ?? 10000,
    scenarioTimeout: config.timeouts?.scenarioTimeout ?? 60000,
    connectionRetry: config.timeouts?.connectionRetry ?? 120000,
    connectionRetryCount: config.timeouts?.connectionRetryCount ?? 3,
    appiumPort: config.timeouts?.appiumPort ?? 4723,
    xmlCacheTtlMinutes: config.timeouts?.xmlCacheTtlMinutes ?? 5
  };
}

/** Returns self-heal config with safe defaults. */
public getSelfHeal(config: McpConfig): Required<SelfHealConfig> {
  return {
    confidenceThreshold: config.selfHeal?.confidenceThreshold ?? 0.7,
    maxCandidates: config.selfHeal?.maxCandidates ?? 3,
    autoApply: config.selfHeal?.autoApply ?? false
  };
}

/** Returns reporting config with safe defaults. */
public getReporting(config: McpConfig): Required<ReportingConfig> {
  return {
    format: config.reporting?.format ?? 'html',
    outputDir: config.reporting?.outputDir ?? 'reports',
    screenshotOn: config.reporting?.screenshotOn ?? 'failure'
  };
}
```

---

### File 2: `c:\Users\Rohit\mcp\AppForge\src\services\ProjectSetupService.ts`

#### Step 4 — Add new fields to `scaffoldMcpConfig()` output

Find `scaffoldMcpConfig()` (~line 591). Find the config object literal.
After the `reuse` block (or wherever the object ends), add:

```typescript
codegen: {
  customWrapperPackage: null,
  basePageStrategy: "extend",
  namingConvention: {
    pageObjectSuffix: "Page",
    caseStyle: "PascalCase"
  },
  gherkinStyle: "strict",
  tagTaxonomy: ["@smoke", "@regression"],
  generateFiles: "full"
},
timeouts: {
  elementWait: 10000,
  scenarioTimeout: 60000,
  connectionRetry: 120000,
  connectionRetryCount: 3,
  appiumPort: 4723,
  xmlCacheTtlMinutes: 5
},
selfHeal: {
  confidenceThreshold: 0.7,
  maxCandidates: 3,
  autoApply: false
},
reporting: {
  format: "html",
  outputDir: "reports",
  screenshotOn: "failure"
}
```

Also add `tsconfigPath` field to the scaffold output:
```typescript
// After the reporting block:
tsconfigPath: null,  // Set this to your tsconfig path if not using root tsconfig.json
```

Also add a JSON comment property (string key naming convention for documentation in JSON):
```typescript
"$docs": "See docs/MCP_CONFIG_REFERENCE.md for full field reference and examples."
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. `McpConfigService` exports: `CodegenConfig`, `TimeoutsConfig`, `SelfHealConfig`, `ReportingConfig`.
3. `McpConfigService` has: `getCodegen()`, `getTimeouts()`, `getSelfHeal()`, `getReporting()`.
4. Scaffolded `mcp-config.json` (run `setup_project` in a temp dir) includes all four new sections.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] Four new interfaces exported from `McpConfigService.ts`
- [ ] Four new accessor methods on `McpConfigService`
- [ ] `tsconfigPath?: string | null` field added to `McpConfig` interface with JSDoc
- [ ] `scaffoldMcpConfig()` includes all four new sections + `tsconfigPath: null` with correct defaults
- [ ] No existing functionality broken
- [ ] Change `Status` above to `DONE`

---

## Note for Next Session

The `tsconfigPath` field is **consumed** in:
- `SandboxEngine.ts` (TASK-20 scope) — pass `--tsconfig` flag when present
- `validate_and_write` handler in `index.ts` (TASK-20 scope) — same

Do NOT wire up the consumption in this task. This task is schema-only.
