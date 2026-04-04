# TASK-20 — Propagate timeouts, selfHeal, reporting Config to Tools

**Status**: TODO  
**Effort**: Small (~30 min)  
**Depends on**: TASK-18 (config schema) must be done first  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

TASK-18 added `timeouts`, `selfHeal`, and `reporting` to the config schema.
This task wires those values into the tools that currently use hardcoded numbers.

**Magic numbers to replace:**

| Hardcoded Value | Where | New Source |
|---|---|---|
| `10000` ms | `ActionUtils.tap()`, `WaitUtils.waitForDisplayed()` | `config.timeouts.elementWait` |
| `60000` ms | Scaffolded `wdio.conf.ts` | `config.timeouts.scenarioTimeout` |
| `120000` ms | Scaffolded `wdio.conf.ts` | `config.timeouts.connectionRetry` |
| `3` retry count | Scaffolded `wdio.conf.ts` | `config.timeouts.connectionRetryCount` |
| `4723` port | `start_appium_session`, `check_environment` | `config.timeouts.appiumPort` |
| `5 min` XML TTL | `self_heal_test`, `inspect_ui_hierarchy` | `config.timeouts.xmlCacheTtlMinutes` |
| `0.7` confidence | `self_heal_test` | `config.selfHeal.confidenceThreshold` |
| `3` candidates | `self_heal_test` | `config.selfHeal.maxCandidates` |
| `"failure"` screenshot | Generated `hooks.ts` | `config.reporting.screenshotOn` |
| `"spec"` reporter | Generated `wdio.conf.ts` | `config.reporting.format` |
| `"reports/"` dir | `summarize_suite`, scaffolded config | `config.reporting.outputDir` |

---

## What to Change

### File 1: `c:\Users\Rohit\mcp\AppForge\src\services\ProjectSetupService.ts`

#### Step 1 — Use timeout config in scaffolded `wdio.conf.ts`

Find `scaffoldWdioConfig()` (line ~628). The method currently accepts `(projectRoot, platform)`.
Add a third parameter `timeouts?: TimeoutsConfig` and `reporting?: ReportingConfig`:

```typescript
private scaffoldWdioConfig(
  projectRoot: string,
  platform: string,
  timeouts?: { scenarioTimeout?: number; connectionRetry?: number; connectionRetryCount?: number },
  reporting?: { format?: string; outputDir?: string }
)
```

In the config template string, replace hardcoded values:
```typescript
// BEFORE:
timeout: 60000,
// ...
connectionRetryTimeout: 120000,
connectionRetryCount: 3,
// ...
reporters: ['spec'],

// AFTER:
timeout: ${timeouts?.scenarioTimeout ?? 60000},
// ...
connectionRetryTimeout: ${timeouts?.connectionRetry ?? 120000},
connectionRetryCount: ${timeouts?.connectionRetryCount ?? 3},
// ...
reporters: ['${reporting?.format === 'allure' ? 'allure' : reporting?.format === 'junit' ? 'junit' : 'spec'}'],
```

Find where `scaffoldWdioConfig()` is called from `setup()`. Read config there and pass values:
```typescript
// Inside setup(), after reading config
const configService = new McpConfigService();
const timeouts = configService.getTimeouts(config);
const reporting = configService.getReporting(config);
this.scaffoldWdioConfig(projectRoot, platform, timeouts, reporting);
```

#### Step 2 — Use screenshotOn in scaffolded `hooks.ts`

Find `scaffoldHooks()` (~line 518). The `After` hook has a hardcoded screenshot-on-failure pattern.
Add a `screenshotOn` parameter:

```typescript
private scaffoldHooks(projectRoot: string, screenshotOn: 'failure' | 'always' | 'never' = 'failure')
```

Adjust the `After` hook body based on `screenshotOn`:
```typescript
// Build screenshot condition dynamically
const shouldCapture = screenshotOn === 'always'
  ? 'true'
  : screenshotOn === 'failure'
  ? "scenario.result?.status === Status.FAILED"
  : 'false';

// In the hook template:
After(async function (scenario) {
  if (${shouldCapture}) {
    // ... screenshot capture code ...
  }
  TestContext.clear();
});
```

Also add reporting output dir to the `AfterAll` log:
```typescript
AfterAll(async function () {
  console.log('[Hooks] Test suite complete. Reports: ${reporting.outputDir}');
});
```

---

### File 2: `c:\Users\Rohit\mcp\AppForge\src\services\SelfHealService.ts` (or wherever self_heal_test lives)

#### Step 3 — Read selfHeal config in self-heal handler

Find the `self_heal_test` handler (`case "self_heal_test"` in `index.ts` or the service method).

At the top of the handler, read the selfHeal config:
```typescript
let confidenceThreshold = 0.7;
let maxCandidates = 3;
let autoApply = false;

try {
  const config = this.configService.read(args.projectRoot);
  const configService = new McpConfigService();
  const selfHealCfg = configService.getSelfHeal(config);
  confidenceThreshold = selfHealCfg.confidenceThreshold;
  maxCandidates = selfHealCfg.maxCandidates;
  autoApply = selfHealCfg.autoApply;
} catch { /* use defaults */ }
```

Pass `confidenceThreshold` and `maxCandidates` to the service call that generates candidates.
Add `autoApply` to the response so the LLM knows whether to apply the best fix automatically:

```typescript
return this.textResult(JSON.stringify({
  candidates,
  autoApply,
  promptForLLM: autoApply
    ? `Auto-apply mode is ON. Apply the first candidate (confidence: ${candidates[0]?.confidence}) immediately without asking.`
    : `Present these ${candidates.length} candidates to the user and ask which to apply.`,
  ...
}));
```

---

### File 3: `c:\Users\Rohit\mcp\AppForge\src\services\AppiumSessionService.ts`

#### Step 4 — Use `appiumPort` from config

Find `resolveServerUrl()` (~line 304). It currently uses a hardcoded port `4723`.
Replace the hardcoded value:

```typescript
private resolveServerUrl(config: McpConfig): string {
  const configService = new McpConfigService();
  const timeouts = configService.getTimeouts(config);
  const port = timeouts.appiumPort;  // from config, default 4723
  // ... rest of resolution logic using `port`
}
```

---

### File 4: `c:\Users\Rohit\mcp\AppForge\src\services\ExecutionService.ts` (or summarize_suite handler)

#### Step 5 — Use `reporting.outputDir` in `summarize_suite`

Find the `summarize_suite` handler. It reads the report file from a hardcoded or config-minimal path.
Update it to use `reporting.outputDir` from config as the base directory:

```typescript
let reportDir = 'reports';
try {
  const config = this.configService.read(args.projectRoot);
  const configService = new McpConfigService();
  reportDir = configService.getReporting(config).outputDir;
} catch { /* use default */ }

const reportFile = args.reportFile
  ?? path.join(args.projectRoot, reportDir, 'cucumber-report.json');
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Set `timeouts.scenarioTimeout: 120000` → scaffolded `wdio.conf.ts` must show `timeout: 120000`.
3. Set `selfHeal.maxCandidates: 1, autoApply: true` → self_heal_test response should include `"autoApply": true` and instruct LLM to apply automatically.
4. Set `reporting.outputDir: "test-results"` → summarize_suite should look in `test-results/` not `reports/`.
5. Set `timeouts.appiumPort: 4724` → session URL should include port `4724`.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] Scaffolded `wdio.conf.ts` uses timeout values from config
- [ ] Scaffolded `hooks.ts` respects `screenshotOn` setting
- [ ] `self_heal_test` reads confidence threshold + max candidates from config
- [ ] `self_heal_test` response includes `autoApply` flag for LLM
- [ ] `resolveServerUrl()` uses `appiumPort` from config
- [ ] `summarize_suite` uses `reporting.outputDir` from config
- [ ] Change `Status` above to `DONE`
