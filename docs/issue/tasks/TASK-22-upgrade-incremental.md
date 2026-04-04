# TASK-22 — upgrade_project: Incremental Config Audit + Progressive Scaffolding

**Status**: TODO  
**Effort**: Medium (~50 min)  
**Depends on**: TASK-21 (two-phase setup must be done first)  
**Build check**: `npm run build` in `c:\Users\Rohit\mcp\AppForge`

---

## Context (No Prior Chat Needed)

After the two-phase setup (TASK-21), users fill in config fields progressively over time.
When they add a new config field (e.g. they finally chose a credential strategy, or they
discovered their port is 4724, or they now want Allure reports), they should be able to call
`upgrade_project` and have AppForge apply only the newly-affected scaffolding.

**Current `upgrade_project` behavior**: Repairs missing files from a fixed list.
It does not know about config changes and does not generate environment-specific scaffolding.

**New `upgrade_project` behavior**:

```
1. Read current mcp-config.json
2. Scan for CONFIGURE_ME markers (report as "pending")
3. Compare config version against scaffold version (tracked in mcp-config.json)
4. Run config-aware scaffold steps for newly configured features:
   - credentials.strategy set for first time? → create credentials/ scaffold
   - reporting.format changed to "allure"? → add allure reporter to wdio.conf.ts
   - codegen.customWrapperPackage added? → remove AppForge-generated BasePage.ts if unused
   - timeouts changed? → nothing to scaffold, report "timeouts will apply next generate_cucumber_pom run"
5. Return summary: what was applied, what is still pending
```

---

## What to Change

### File 1: `c:\Users\Rohit\mcp\AppForge\src\services\ProjectSetupService.ts`

#### Step 1 — Add `upgradeFromConfig()` method

This is the new intelligence in `upgrade_project`. Add this method:

```typescript
public async upgradeFromConfig(projectRoot: string): Promise<string> {
  const configPath = path.join(projectRoot, 'mcp-config.json');
  if (!fs.existsSync(configPath)) {
    return JSON.stringify({
      status: 'NO_CONFIG',
      message: 'No mcp-config.json found. Run setup_project first.',
      nextStep: 'Call setup_project to begin the two-phase project setup.'
    }, null, 2);
  }

  let config: McpConfig;
  try {
    config = this.mcpConfigService.read(projectRoot);
  } catch (err: any) {
    return JSON.stringify({
      status: 'CONFIG_PARSE_ERROR',
      message: `Cannot read mcp-config.json: ${err.message}`,
      hint: 'Run: npx jsonlint mcp-config.json to find syntax errors'
    }, null, 2);
  }

  const applied: string[] = [];
  const skipped: string[] = [];
  const pending: string[] = [];

  // Scan for CONFIGURE_ME markers
  const unfilledFields = this.scanConfigureMe(projectRoot);
  if (unfilledFields.length > 0) {
    pending.push(...unfilledFields.map(f => `${f} (still has CONFIGURE_ME value)`));
  }

  // ─── Credential Strategy ──────────────────────────────────────────────────
  if (config.credentials?.strategy && config.credentials.strategy !== 'CONFIGURE_ME') {
    const credDir = path.join(projectRoot, 'credentials');
    if (!fs.existsSync(credDir)) {
      fs.mkdirSync(credDir, { recursive: true });
      applied.push('Created credentials/ directory');
    }

    // Ensure .gitignore covers credentials/
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const gi = fs.readFileSync(gitignorePath, 'utf-8');
      if (!gi.includes('credentials/')) {
        fs.writeFileSync(gitignorePath, gi.trimEnd() + '\n\ncredentials/\n', 'utf-8');
        applied.push('Added credentials/ to .gitignore');
      }
    }

    // Scaffold credential file if it doesn't exist
    let credFile: string;
    const strategy = config.credentials.strategy;
    if (strategy === 'per-env-files') {
      const env = this.mcpConfigService.getCurrentEnvironment(config);
      credFile = path.join(credDir, `users.${env}.json`);
      const sample = [
        { role: 'admin', username: `admin@${env}.com`, password: 'FILL_IN' },
        { role: 'readonly', username: `viewer@${env}.com`, password: 'FILL_IN' }
      ];
      this.writeIfNotExists(credFile, JSON.stringify(sample, null, 2));
      applied.push(`Scaffolded credentials/users.${env}.json (per-env-files strategy)`);
    } else if (strategy === 'role-env-matrix' || strategy === 'unified-key') {
      credFile = config.credentials.file
        ? path.join(projectRoot, config.credentials.file)
        : path.join(credDir, 'users.json');
      if (!fs.existsSync(credFile)) {
        const env = this.mcpConfigService.getCurrentEnvironment(config);
        const sample = strategy === 'role-env-matrix'
          ? { admin: { [env]: { username: `admin@${env}.com`, password: 'FILL_IN' } } }
          : { [`admin-${env}`]: { username: `admin@${env}.com`, password: 'FILL_IN' } };
        fs.writeFileSync(credFile, JSON.stringify(sample, null, 2), 'utf-8');
        applied.push(`Scaffolded ${path.relative(projectRoot, credFile)} (${strategy} strategy)`);
      } else {
        skipped.push(`credentials file already exists: ${path.relative(projectRoot, credFile)}`);
      }
    } else if (strategy === 'custom' && !config.credentials.schemaHint) {
      pending.push('credentials.schemaHint — describe your credential JSON schema so AppForge can generate the reader');
    }
  } else {
    pending.push('credentials.strategy — run manage_users to choose a credential storage pattern');
  }

  // ─── Reporting Format ────────────────────────────────────────────────────────
  const reporting = this.mcpConfigService.getReporting(config);
  if (reporting.format === 'allure') {
    const wdioConf = path.join(projectRoot, 'wdio.conf.ts');
    if (fs.existsSync(wdioConf)) {
      const wdioContent = fs.readFileSync(wdioConf, 'utf-8');
      if (!wdioContent.includes('allure')) {
        // Patch reporters line
        const patched = wdioContent.replace(
          /reporters:\s*\[['"]spec['"]\]/,
          `reporters: [['allure', { outputDir: '${reporting.outputDir}/allure-results' }]]`
        );
        if (patched !== wdioContent) {
          fs.writeFileSync(wdioConf, patched, 'utf-8');
          applied.push('Updated wdio.conf.ts to use Allure reporter');
        }
      }
    }
  }

  // ─── customWrapperPackage ──────────────────────────────────────────────────
  const codegen = this.mcpConfigService.getCodegen(config);
  if (codegen.customWrapperPackage) {
    const basePagePath = path.join(projectRoot, 'src', 'pages', 'BasePage.ts');
    if (fs.existsSync(basePagePath)) {
      pending.push(
        `BasePage.ts exists but customWrapperPackage="${codegen.customWrapperPackage}" is set. ` +
        `If BasePage.ts is unused, delete it manually and update imports.`
      );
    } else {
      skipped.push(`customWrapperPackage set — BasePage.ts not generated (correct)`);
    }
  }

  // ─── Environments ────────────────────────────────────────────────────────────
  if (config.environments && config.environments.length > 0 && !config.environments[0].startsWith('CONFIGURE_ME')) {
    // If currentEnvironment is set and valid, nothing to scaffold — just confirm
    const currentEnv = this.mcpConfigService.getCurrentEnvironment(config);
    skipped.push(`environments configured: [${config.environments.join(', ')}], current: "${currentEnv}"`);
  } else {
    pending.push('environments — define your test environment names (e.g. ["local", "staging", "prod"])');
    pending.push('currentEnvironment — set which environment to run tests against');
  }

  // ─── Repair missing base files ────────────────────────────────────────────
  // Reuse existing repair logic for any missing baseline files
  const repairResult = await this.repair(projectRoot, config.mobile?.defaultPlatform ?? 'android');
  if (repairResult.repairedFiles && repairResult.repairedFiles.length > 0) {
    applied.push(...repairResult.repairedFiles.map((f: string) => `Repaired missing file: ${f}`));
  }

  // ─── Summary ─────────────────────────────────────────────────────────────────
  return JSON.stringify({
    status: pending.length === 0 ? 'FULLY_CONFIGURED' : 'PARTIAL',
    applied,
    skipped,
    pending,
    message: pending.length === 0
      ? '✅ Your project is fully configured and up to date.'
      : `⚠️ ${pending.length} item(s) still need your attention (see "pending").`,
    hint: pending.length > 0
      ? 'Fill in the pending fields in mcp-config.json, then run upgrade_project again.'
      : null
  }, null, 2);
}
```

#### Step 2 — Expose `scanConfigureMe()` from TASK-21

Verify that `scanConfigureMe()` (added in TASK-21) is accessible from `upgradeFromConfig()`.
It is defined on the same class, so no import changes needed.

#### Step 3 — Route the existing `upgrade_project` handler to `upgradeFromConfig()`

Find the existing `upgrade()` or `repair()` public method that `upgrade_project` calls.
Modify it to call `upgradeFromConfig()` as the primary logic, then fall through to existing repair:

```typescript
public async upgrade(projectRoot: string): Promise<string> {
  // New: config-aware upgrade is the primary flow
  return this.upgradeFromConfig(projectRoot);
}
```

---

### File 2: `c:\Users\Rohit\mcp\AppForge\src\index.ts`

#### Step 4 — Update `upgrade_project` tool description

Find the `upgrade_project` tool description. Replace:

```typescript
description: `UPGRADE & SYNC PROJECT. Run this any time after updating mcp-config.json to apply new settings.

What it does:
  1. Reads your current mcp-config.json
  2. Reports any fields still set to CONFIGURE_ME (pending setup)
  3. Applies scaffolding for newly configured features:
     • credentials.strategy set → creates credentials/ scaffold + gitignore entry
     • reporting.format = "allure" → patches wdio.conf.ts reporters
     • customWrapperPackage set → warns if AppForge-generated BasePage.ts conflicts
     • New optional config fields added → scaffolds what's missing
  4. Repairs any missing baseline files (safe, never overwrites custom code)

Run upgrade_project after:
  → Adding environments / currentEnvironment to config
  → Setting credentials.strategy for the first time
  → Changing reporting.format
  → Adding customWrapperPackage
  → Any manage_config write that should affect generated files

Returns: { status, applied[], skipped[], pending[], message }`,
```

#### Step 5 — Update `repair_project` tool description  

Find `repair_project` description. Add a clarifying note:

```typescript
description: `REPAIR MISSING FILES. Regenerates ONLY missing baseline files — never overwrites custom code. Safe to run at any time.

For config-aware upgrades (applying new mcp-config.json settings to generated files), use upgrade_project instead.
repair_project focuses on file completeness; upgrade_project focuses on config-driven changes.

Returns: list of files regenerated.`,
```

---

## Verification

1. `npm run build` — zero TypeScript errors.
2. Set `credentials.strategy: "role-env-matrix"` in test config. Run `upgrade_project`.
   → `credentials/users.json` scaffold should be created.
   → `credentials/` should be in `.gitignore`.
3. Leave `environments: ["CONFIGURE_ME"]`. Run `upgrade_project`.
   → `pending` list should include `environments`.
4. Set `reporting.format: "allure"`. Run `upgrade_project`.
   → `wdio.conf.ts` should have Allure reporter patched in.
5. `upgrade_project` on fully configured project → `status: "FULLY_CONFIGURED"`, `pending: []`.

---

## Done Criteria
- [ ] `npm run build` passes with zero errors
- [ ] `upgradeFromConfig()` is the primary logic of `upgrade_project`
- [ ] Credentials scaffold applied when strategy is newly set
- [ ] `.gitignore` updated to include `credentials/` when credentials strategy is set
- [ ] Allure reporter patched into wdio.conf.ts when `reporting.format: "allure"` set
- [ ] `pending` list includes all CONFIGURE_ME and missing recommended fields
- [ ] `status: "FULLY_CONFIGURED"` only when zero pending items
- [ ] `upgrade_project` description updated
- [ ] `repair_project` description updated to clarify its separate scope
- [ ] Change `Status` above to `DONE`
