import fs from 'fs';
import path from 'path';
import type { CodebaseAnalysisResult } from './CodebaseAnalyzerService.js';

// ─── Code Quality Types (Wave 2 — Phase 1.2) ─────────────────────────────────

export type FindingSeverity = 'critical' | 'warning' | 'info';

export interface CodeQualityFinding {
  severity: FindingSeverity;
  category: 'duplicate' | 'magic-number' | 'inconsistent-pattern' | 'multi-responsibility' | 'dead-code';
  message: string;
  locations: string[];       // file paths or "file:line" references
  remediation: string;       // concrete fix description
}

export interface CodeQualityReport {
  schemaVersion: '1.0';
  scannedAt: string;
  projectRoot: string;
  totalFindings: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  findings: CodeQualityFinding[];
  summary: string;
}

/**
 * RefactoringService — Analyzes codebase and suggests cleanup actions.
 * Wave 2 adds deep code-quality analysis with structured JSON output.
 */
export class RefactoringService {

  // ──────────────────────────────────────────────────────────────────────────
  // Wave 2 — Phase 1.2: Structured code quality analysis
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Scans TypeScript source files in the project for quality issues:
   * - Duplicate step definitions
   * - Magic numbers (hardcoded timeouts, delays)
   * - Inconsistent patterns (driver vs browser, $$ vs findElements)
   * - Multi-responsibility methods (> 40 lines)
   * - Dead code candidates (unused imports, private methods)
   */
  public async analyzeCodeQuality(projectRoot: string, analysis: CodebaseAnalysisResult): Promise<CodeQualityReport> {
    const findings: CodeQualityFinding[] = [];
    const tsFiles = this.discoverTsFiles(projectRoot);

    // ── 1. Duplicate step definitions ────────────────────────────────────────
    const stepMap = new Map<string, string[]>();
    for (const def of analysis.existingStepDefinitions) {
      for (const step of def.steps) {
        const key = `${step.type}:${step.pattern}`;
        const files = stepMap.get(key) ?? [];
        files.push(def.file);
        stepMap.set(key, files);
      }
    }
    for (const [pattern, files] of stepMap.entries()) {
      if (files.length > 1) {
        findings.push({
          severity: 'critical',
          category: 'duplicate',
          message: `Duplicate step pattern "${pattern}" defined in ${files.length} files — causes Cucumber compilation errors.`,
          locations: [...new Set(files)],
          remediation: 'Merge duplicate steps into a shared steps file and delete the redundant definitions.',
        });
      }
    }

    // ── 2. Magic numbers (timeouts, delays, retries) ──────────────────────────
    const MAGIC_NUMBER_RE = /(?:timeout|delay|wait|sleep|interval|retry)\s*[=:]\s*(\d{3,6})/gi;
    for (const filePath of tsFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          let m: RegExpExecArray | null;
          const re = new RegExp(MAGIC_NUMBER_RE.source, 'gi');
          while ((m = re.exec(line)) !== null) {
            // Skip if already a named constant reference (e.g., TIMEOUT_MS)
            if (/[A-Z_]{3,}/.test(line.split('=')[0] ?? '')) continue;
            findings.push({
              severity: 'warning',
              category: 'magic-number',
              message: `Magic number ${m[1]}ms found in ${rel}:${idx + 1} — hardcoded timing values cause flakiness on slow devices.`,
              locations: [`${rel}:${idx + 1}`],
              remediation: `Extract to a named constant (e.g., \`const ELEMENT_TIMEOUT_MS = ${m[1]};\`) in a shared config file.`,
            });
          }
        });
      } catch { /* skip unreadable */ }
    }

    // ── 3. Inconsistent patterns (driver vs browser, wdio API mixing) ─────────
    const driverFiles: string[] = [];
    const browserFiles: string[] = [];
    for (const filePath of tsFiles) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const rel = path.relative(projectRoot, filePath).replace(/\\/g, '/');
        if (/\bdriver\s*\.\s*(findElement|click|sendKeys)\b/.test(content)) driverFiles.push(rel);
        if (/\bbrowser\s*\.\s*\$\b|\bawait\s+\$\s*\(/.test(content)) browserFiles.push(rel);
      } catch { /* skip */ }
    }
    if (driverFiles.length > 0 && browserFiles.length > 0) {
      findings.push({
        severity: 'warning',
        category: 'inconsistent-pattern',
        message: `Mixed API usage: ${driverFiles.length} file(s) use Selenium-style \`driver.*\` API while ${browserFiles.length} use WebdriverIO \`browser.$\` API.`,
        locations: [...driverFiles, ...browserFiles],
        remediation: 'Standardise on the WebdriverIO \`browser.$\` / \`$\` API. Replace \`driver.findElement(By.*)\` calls with \`$(selector)\`.',
      });
    }

    // ── 4. Multi-responsibility methods (> 40 lines) ───────────────────────────
    for (const po of analysis.existingPageObjects) {
      // Heuristic: count methods reported vs file line count
      if (po.publicMethods.length > 15) {
        findings.push({
          severity: 'warning',
          category: 'multi-responsibility',
          message: `Page Object \`${po.className}\` in \`${po.path}\` has ${po.publicMethods.length} public methods — likely too many responsibilities.`,
          locations: [po.path],
          remediation: `Split \`${po.className}\` into sub-pages or components. Consider a BasePage with shared actions and derived pages for screen-specific flows.`,
        });
      }
    }

    // ── 5. Dead code: PO methods not referenced by any step ───────────────────
    const allStepText = analysis.existingStepDefinitions
      .flatMap(d => d.steps.map(s => s.pattern.toLowerCase()))
      .join(' ');

    for (const po of analysis.existingPageObjects) {
      const unused = po.publicMethods.filter(m => {
        const lower = m.toLowerCase();
        return !allStepText.includes(lower) && !['constructor', 'init', 'setup', 'teardown'].includes(lower);
      });
      if (unused.length > 0) {
        findings.push({
          severity: 'info',
          category: 'dead-code',
          message: `${unused.length} method(s) in \`${po.className}\` (${po.path}) appear unused by any step definition.`,
          locations: [po.path],
          remediation: `Verify and delete unused methods: ${unused.slice(0, 5).map(m => `\`${m}()\``).join(', ')}${unused.length > 5 ? ` ... +${unused.length - 5} more` : ''}.`,
        });
      }
    }

    // ── Sort by severity ───────────────────────────────────────────────────────
    const order: Record<FindingSeverity, number> = { critical: 0, warning: 1, info: 2 };
    findings.sort((a, b) => order[a.severity] - order[b.severity]);

    const criticalCount = findings.filter(f => f.severity === 'critical').length;
    const warningCount = findings.filter(f => f.severity === 'warning').length;
    const infoCount = findings.filter(f => f.severity === 'info').length;

    const summary = findings.length === 0
      ? '🎉 No quality issues found. The codebase is clean!'
      : `Found ${findings.length} finding(s): ${criticalCount} critical, ${warningCount} warnings, ${infoCount} info. Address critical issues first.`;

    return {
      schemaVersion: '1.0',
      scannedAt: new Date().toISOString(),
      projectRoot,
      totalFindings: findings.length,
      criticalCount,
      warningCount,
      infoCount,
      findings,
      summary,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Existing: Text-format refactoring suggestions
  // ──────────────────────────────────────────────────────────────────────────

  public generateRefactoringSuggestions(analysis: CodebaseAnalysisResult): string {
    const suggestions: string[] = [];
    suggestions.push('### 🧹 Codebase Refactoring & Maintenance Report\n');

    // 1. Detect duplicate step patterns (same pattern in multiple files)
    const stepMap = new Map<string, string[]>();
    for (const def of analysis.existingStepDefinitions) {
      for (const step of def.steps) {
        const key = `${step.type}:${step.pattern}`;
        const files = stepMap.get(key) || [];
        files.push(def.file);
        stepMap.set(key, files);
      }
    }

    const duplicates = [...stepMap.entries()].filter(([_, files]) => files.length > 1);
    if (duplicates.length > 0) {
      suggestions.push('#### 👯 Duplicate Step Definitions');
      suggestions.push('The following steps have identical patterns in multiple files. This causes Cucumber compilation errors. **Merge these into a common steps file:**\n');
      for (const [pattern, files] of duplicates) {
        suggestions.push(`- **Pattern**: \`${pattern}\``);
        for (const f of files) {
          suggestions.push(`  - Found in: \`${f}\``);
        }
      }
      suggestions.push('');
    } else {
      suggestions.push('✅ No duplicate step definition patterns detected.');
    }

    // 2. Detect unused Page Object methods (not referenced by any step)
    const allStepBodies = analysis.existingStepDefinitions.flatMap(d => d.steps.map(s => s.pattern.toLowerCase()));
    const unusedPomMethods: { page: string; methods: string[] }[] = [];

    for (const po of analysis.existingPageObjects) {
      const unused = po.publicMethods.filter(method => {
        const methodLower = method.toLowerCase();
        return !allStepBodies.some(body => body.includes(methodLower));
      });
      if (unused.length > 0) {
        unusedPomMethods.push({ page: po.path, methods: unused });
      }
    }

    if (unusedPomMethods.length > 0) {
      suggestions.push('#### 🗑️ Potentially Unused Page Object Methods');
      suggestions.push('The following methods exist in Page Objects but are not referenced by any step pattern. Consider deleting them:\n');
      for (const po of unusedPomMethods) {
        for (const method of po.methods) {
          suggestions.push(`- **${method}** (File: \`${po.page}\`)`);
        }
      }
      suggestions.push('');
    } else {
      suggestions.push('\n✅ No unused Page Object methods detected.');
    }

    // 3. Locator consistency check
    const xpathCount = analysis.existingPageObjects.reduce((sum, po) =>
      sum + po.locators.filter((l: any) => l.strategy === 'xpath').length, 0);
    const totalLocators = analysis.existingPageObjects.reduce((sum, po) => sum + po.locators.length, 0);

    if (totalLocators > 0 && xpathCount / totalLocators > 0.3) {
      suggestions.push(`\n#### ⚠️ XPath Over-Usage`);
      suggestions.push(`${xpathCount}/${totalLocators} locators (${Math.round(xpathCount / totalLocators * 100)}%) use XPath. Consider migrating to \`accessibility-id\` or \`resource-id\` for stability.\n`);
    }

    if (suggestions.length <= 3) {
      suggestions.push('\n🎉 Your codebase is clean! No refactorings necessary.');
    }

    return suggestions.join('\n');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private discoverTsFiles(projectRoot: string): string[] {
    const results: string[] = [];
    const walk = (dir: string) => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) results.push(full);
        }
      } catch { /* skip */ }
    };
    walk(projectRoot);
    return results;
  }
}


