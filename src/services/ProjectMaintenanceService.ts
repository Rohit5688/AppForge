import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { UtilAuditService } from './UtilAuditService.js';
import { Questioner } from '../utils/Questioner.js';
import { validateProjectRoot } from '../utils/SecurityUtils.js';

const execFileAsync = promisify(execFile);

import { ProjectSetupService } from './ProjectSetupService.js';

export class ProjectMaintenanceService {
  private utilAuditService = new UtilAuditService();
  private projectSetupService = new ProjectSetupService();

  /**
   * Idempotent tool to upgrade project dependencies and structural aspects.
   * 
   * CB-1 FIX: Validates projectRoot to prevent shell injection attacks
   */
  public async upgradeProject(projectRoot: string): Promise<string> {
    const logs: string[] = [];

    // CB-1 FIX: Validate projectRoot before any operations
    try {
      validateProjectRoot(projectRoot);
    } catch (error: any) {
      throw new Error(`Invalid projectRoot: ${error.message}`);
    }

    // 1. Auto-detect project structure
    if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
      throw new Error("No package.json found. Is this a valid project root?");
    }

    // 2. Upgrade dependencies
    try {
      logs.push("Updating core dependencies...");
      // CB-1 FIX: Use execFile with args array instead of shell command string
      await execFileAsync('npm', [
        'install',
        'webdriverio@latest',
        '@cucumber/cucumber@latest',
        '@wdio/cli@latest',
        '@wdio/local-runner@latest',
        '@wdio/cucumber-framework@latest',
        '@wdio/appium-service@latest',
        '@wdio/spec-reporter@latest'
      ], { cwd: projectRoot });
      logs.push("✅ Core dependencies updated to latest.");
    } catch (error: any) {
      logs.push(`❌ Failed to update dependencies: ${error.message}`);
    }

    // 3. Ensure backup directory exists
    const backupDir = path.join(projectRoot, '.AppForge', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      logs.push(`✅ Created backup directory at ${backupDir}`);
    }

    // 4. Ensure mcp-config.json exists
    const configPath = path.join(projectRoot, 'mcp-config.json');
    if (!fs.existsSync(configPath)) {
      logs.push('⚠️ Missing mcp-config.json. Run setup_project to generate it.');
    } else {
      // Add version tag if missing
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(raw);
      
      if (config.paths && Object.keys(config.paths).length > 0) {
        logs.push('⚠️ Custom paths detected in mcp-config.json. Keeping existing paths and skipping default path regeneration.');
      }
      
      if (!config.version) {
        config.version = '1.0.0';
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        logs.push('✅ Migrated mcp-config.json to standard versioning format.');
      }

      // Check for legacy wdio monolith vs multi-config
      const wdioPath = path.join(projectRoot, 'wdio.conf.ts');
      const wdioShared = path.join(projectRoot, 'wdio.shared.conf.ts');
      if (fs.existsSync(wdioPath) && !fs.existsSync(wdioShared)) {
        logs.push('💡 Tip: Your project is using a monolithic wdio.conf.ts. The Appium MCP now supports Multi-Config Architecture (wdio.shared.conf.ts + specific platform configs).');
        logs.push('   > Run `setup_project` with `platform: "both"` to auto-generate the new split configuration files!');
      }
    }

    try {
      const audit = await this.utilAuditService.audit(projectRoot);
      logs.push(`\n📊 Utility Coverage: ${audit.coveragePercent}%`);
      if (audit.missing.length > 0) {
        logs.push(`⚠️ Missing recommended utilities:`);
        audit.actionableSuggestions.forEach(s => logs.push(`   - ${s}`));
      }
    } catch (e) {
      // ignore
    }

    try {
      logs.push("Verifying project structure...");
      await this.repairProject(projectRoot, "android");
      logs.push("✅ Standard scaffolding files verified/repaired.");
    } catch (e) {
      logs.push("⚠️ Could not verify standard files structure.");
    }

    const summary = logs.join('\n');
    return summary;
  }

  /**
   * Safe to run at any time — only generates files that are missing and never overwrites existing ones.
   * 
   * CB-1 FIX: Validates projectRoot to prevent shell injection attacks
   */
  public async repairProject(projectRoot: string, platform: 'android' | 'ios' | 'both' = 'android'): Promise<string> {
    // CB-1 FIX: Validate projectRoot before any operations
    try {
      validateProjectRoot(projectRoot);
    } catch (error: any) {
      throw new Error(`Invalid projectRoot: ${error.message}`);
    }

    try {
      await this.projectSetupService.setup(projectRoot, platform, 'RepairedApp');
      return "✅ Project repair completed. Missing baseline files were regenerated.";
    } catch (error: any) {
      throw new Error(`Failed to repair project: ${error.message}`);
    }
  }
}
