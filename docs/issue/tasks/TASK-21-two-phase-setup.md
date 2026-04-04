# TASK-21 — Two-Phase setup_project: Config-First Setup Flow

**Status**: TODO  
**Effort**: Medium (~60 min)  
**Depends on**: TASK-17, TASK-18 (both config schemas must be in place)  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

Currently `setup_project` does everything in one shot — asks questions, scaffolds files.
Users who don't know all answers (e.g. "I don't know my team's tag taxonomy yet") get stuck
or receive a project scaffolded with wrong defaults they have to manually fix later.

**New two-phase flow:**

```
Phase 1 (always run first):
  → Generate mcp-config.json template with all fields, commented defaults, and CONFIGURE_ME markers
  → Return guide asking user to fill in what they know
  → User fills config, then calls setup_project again

Phase 2 (when mcp-config.json already exists):
  → Read config
  → Scaffold files based on actual config values
  → Skip sections where config is incomplete (warn user)
  → Return setup summary + list of remaining CONFIGURE_ME fields
```

**Existing project handling:**
- If `mcp-config.json` exists AND project files already exist → route to `upgrade_project` logic (TASK-22)
- Phase 2 uses `writeIfNotExists()` for all files — safe to run on partially-scaffolded projects

---

## What to Change

### File 1: `c:\Users\Rohit\mcp\AppForge\src\services\ProjectSetupService.ts`

#### Step 1 — Add `generateConfigTemplate()` method

This generates a fully self-documenting mcp-config.json template.
Fields the user must fill have `"CONFIGURE_ME"` as their value.
All sections are present so the user sees the full picture at once.

Add this method to `ProjectSetupService`:

```typescript
public generateConfigTemplate(projectRoot: string): string {
  const configPath = path.join(projectRoot, 'mcp-config.json');
  const schemaDir = path.join(projectRoot, '.AppForge');

  if (!fs.existsSync(schemaDir)) fs.mkdirSync(schemaDir, { recursive: true });

  const template = {
    "$schema": "./.AppForge/configSchema.json",
    "$docs": "Full field reference: docs/MCP_CONFIG_REFERENCE.md",
    "version": "1.1.0",

    // =============================================================
    // REQUIRED: Fill these before calling setup_project again
    // =============================================================
    "project": {
      "language": "typescript",
      "testFramework": "cucumber",
      "client": "webdriverio-appium",
      "executionCommand": "npx wdio run wdio.conf.ts"
    },
    "mobile": {
      "defaultPlatform": "CONFIGURE_ME: android or ios",
      "capabilitiesProfiles": {
        "myDevice": {
          "_comment": "Rename 'myDevice' to your device name (e.g. pixel8, iphone14)",
          "platformName": "CONFIGURE_ME: Android or iOS",
          "appium:automationName": "CONFIGURE_ME: UiAutomator2 or XCUITest",
          "appium:deviceName": "CONFIGURE_ME: e.g. Pixel_8 or iPhone 14",
          "appium:app": "CONFIGURE_ME: /path/to/your/app.apk (or .ipa/.app)"
        }
      }
    },

    // =============================================================
    // RECOMMENDED: Fill what you know now, update later
    // =============================================================
    "paths": {
      "_comment": "Change only if your project doesn't use the default folder names",
      "featuresRoot": "features",
      "pagesRoot": "pages",
      "stepsRoot": "step-definitions",
      "utilsRoot": "utils",
      "testDataRoot": "src/test-data"
    },
    "environments": ["CONFIGURE_ME: e.g. local, staging, prod"],
    "currentEnvironment": "CONFIGURE_ME: which environment to test against now",
    "credentials": {
      "_comment": "Run manage_users to choose a strategy. Options: role-env-matrix, per-env-files, unified-key, custom",
      "strategy": "CONFIGURE_ME: run manage_users to see options"
    },
    "codegen": {
      "customWrapperPackage": null,
      "_customWrapperPackage_hint": "If you have a shared test library (e.g. @myorg/test-utils), put the package name here",
      "basePageStrategy": "extend",
      "_basePageStrategy_options": "extend | compose | custom",
      "namingConvention": {
        "pageObjectSuffix": "Page",
        "_pageObjectSuffix_options": "Page | Screen | Component | Flow",
        "caseStyle": "PascalCase",
        "_caseStyle_options": "PascalCase | camelCase"
      },
      "gherkinStyle": "strict",
      "_gherkinStyle_options": "strict | flexible",
      "tagTaxonomy": ["CONFIGURE_ME: list your team's valid test tags e.g. @smoke, @P0, @regression"],
      "generateFiles": "full",
      "_generateFiles_options": "full | feature-steps | feature-only"
    },
    "reuse": {
      "locatorOrder": ["accessibility id", "resource-id", "xpath", "class chain", "predicate", "text"]
    },

    // =============================================================
    // OPTIONAL: Only change if defaults don't work for you
    // =============================================================
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
      "_format_options": "html | allure | junit | none",
      "outputDir": "reports",
      "screenshotOn": "failure",
      "_screenshotOn_options": "failure | always | never"
    }
  };

  fs.writeFileSync(configPath, JSON.stringify(template, null, 2), 'utf-8');
  return configPath;
}
```

#### Step 2 — Add `scanConfigureMe()` helper

This reads the config and returns a list of fields that still have `"CONFIGURE_ME"` markers:

```typescript
public scanConfigureMe(projectRoot: string): string[] {
  const configPath = path.join(projectRoot, 'mcp-config.json');
  if (!fs.existsSync(configPath)) return ['mcp-config.json not found'];
  
  const raw = fs.readFileSync(configPath, 'utf-8');
  const unconfigured: string[] = [];
  
  // Find all values that start with "CONFIGURE_ME"
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('"CONFIGURE_ME')) {
      // Extract the key name from the previous or current line
      const keyMatch = line.match(/"([^"]+)":\s*"CONFIGURE_ME/);
      if (keyMatch) {
        unconfigured.push(keyMatch[1]);
      }
    }
  }
  
  return unconfigured;
}
```

#### Step 3 — Refactor the main `setup()` method to support two phases

Find the public `setup()` method. Completely refactor its opening logic:

```typescript
public async setup(projectRoot: string, platform: string = 'android', appName: string = 'MyApp'): Promise<string> {
  const configPath = path.join(projectRoot, 'mcp-config.json');
  
  // ─── PHASE 1: Config does not exist yet ─────────────────────────────────────
  if (!fs.existsSync(configPath)) {
    this.generateConfigTemplate(projectRoot);
    return JSON.stringify({
      phase: 1,
      status: 'CONFIG_TEMPLATE_CREATED',
      configPath,
      message: [
        '📋 STEP 1 of 2: mcp-config.json has been created.',
        '',
        'Open mcp-config.json and fill in at minimum:',
        '  • mobile.defaultPlatform (android or ios)',
        '  • mobile.capabilitiesProfiles[yourDevice] fields',
        '  • environments (list your env names, e.g. ["local", "staging", "prod"])',
        '  • currentEnvironment (which env to test against now)',
        '  • codegen.tagTaxonomy (your team\'s valid test tags)',
        '',
        'You do NOT need to fill in everything now.',
        'Fields marked CONFIGURE_ME can be filled later — run upgrade_project when you do.',
        '',
        '📖 Reference: docs/MCP_CONFIG_REFERENCE.md explains every field.',
        '',
        'When ready, call setup_project again with the same projectRoot to continue.'
      ].join('\n'),
      docsPath: path.join(projectRoot, 'docs', 'MCP_CONFIG_REFERENCE.md'),
      nextStep: 'Call setup_project again after filling mcp-config.json'
    }, null, 2);
  }

  // ─── PHASE 2: Config exists — scan for CONFIGURE_ME and scaffold ─────────────
  const unfilledFields = this.scanConfigureMe(projectRoot);
  
  let config: McpConfig;
  try {
    config = this.mcpConfigService.read(projectRoot);
  } catch (err: any) {
    return JSON.stringify({
      phase: 2,
      status: 'CONFIG_PARSE_ERROR',
      message: `Cannot read mcp-config.json: ${err.message}. Fix the syntax error and try again.`,
      hint: 'Run: npx jsonlint mcp-config.json to find syntax errors'
    }, null, 2);
  }

  // Warn about required fields still set to CONFIGURE_ME
  const requiredUnfilled = unfilledFields.filter(f =>
    ['defaultPlatform', 'platformName', 'automationName', 'deviceName', 'appium:app'].includes(f)
  );
  if (requiredUnfilled.length > 0) {
    return JSON.stringify({
      phase: 2,
      status: 'REQUIRED_FIELDS_MISSING',
      message: 'The following required fields still have CONFIGURE_ME values. Fill these in mcp-config.json first:',
      requiredFields: requiredUnfilled,
      hint: 'Recommended fields can be left as CONFIGURE_ME — they will use defaults until you set them.'
    }, null, 2);
  }

  // ─── Proceed with scaffolding ────────────────────────────────────────────────
  // ... existing scaffold calls here, adapted to use `config` values ...
  
  // After scaffolding:
  return JSON.stringify({
    phase: 2,
    status: 'SETUP_COMPLETE',
    filesCreated: [ /* list scaffolded files */ ],
    unfilledOptionalFields: unfilledFields,
    message: unfilledFields.length > 0
      ? `Project scaffolded. ${unfilledFields.length} optional field(s) still have CONFIGURE_ME values. Fill them and run upgrade_project to apply.`
      : 'Project fully scaffolded from your mcp-config.json.',
    nextSteps: [
      'Run check_environment to verify your Appium setup',
      'Run start_appium_session to connect to your device',
      unfilledFields.length > 0 ? `Fill: ${unfilledFields.join(', ')} in mcp-config.json` : null
    ].filter(Boolean)
  }, null, 2);
}
```

---

### File 2: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

#### Step 4 — Update `setup_project` tool description

Find the `setup_project` tool description. Replace entirely:

```typescript
description: `FIRST-TIME SETUP & INCREMENTAL SCAFFOLD. Sets up a new or partially-configured project.

PHASE 1 (first call — no mcp-config.json exists):
  → Creates a self-documenting mcp-config.json template with ALL fields and explanations
  → Returns instructions to fill in what you know (not everything is required immediately)
  → Call setup_project again when ready to scaffold files

PHASE 2 (second call — mcp-config.json exists):
  → Reads your config and scaffolds project files based on YOUR choices
  → Skips optional sections where config still has CONFIGURE_ME (warns you)
  → Returns list of remaining unconfigured fields

You do NOT need all answers upfront. Add config fields over time and run upgrade_project to apply new scaffolding.

📖 Full config guide: docs/MCP_CONFIG_REFERENCE.md (created in Phase 1)

Returns: { phase, status, filesCreated?, unfilledOptionalFields?, nextSteps[] }`,
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Delete test `mcp-config.json`. Call `setup_project` → should create config template, return phase 1 response with instructions.
3. Open generated config — must contain `CONFIGURE_ME` markers in required fields.
4. Fill in required fields. Call `setup_project` again → should scaffold files, return phase 2 response.
5. Leave optional fields as `CONFIGURE_ME` → phase 2 should succeed with warning about unfilled fields.
6. Check `docs/MCP_CONFIG_REFERENCE.md` exists in project after phase 1.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `generateConfigTemplate()` creates self-documenting mcp-config.json
- [ ] `scanConfigureMe()` returns list of unfilled fields
- [ ] First `setup_project` call (no config) → phase 1: creates template, returns instructions
- [ ] Second `setup_project` call (config exists) → phase 2: scaffolds files from config values
- [ ] Required-field CONFIGURE_ME → blocks scaffolding with clear error
- [ ] Optional-field CONFIGURE_ME → allows scaffolding with warning
- [ ] `setup_project` description updated to explain two-phase flow
- [ ] `docs/MCP_CONFIG_REFERENCE.md` referenced in phase 1 response
- [ ] Change `Status` above to `DONE`
