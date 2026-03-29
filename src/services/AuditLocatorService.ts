import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs/promises';

export interface LocatorAuditEntry {
  file: string;
  className: string;
  locatorName: string;
  strategy: string;
  selector: string;
  severity: 'ok' | 'warning' | 'critical';
  recommendation: string;
}

export interface LocatorAuditReport {
  totalLocators: number;
  accessibilityIdCount: number;
  xpathCount: number;
  otherCount: number;
  entries: LocatorAuditEntry[];
  markdownReport: string;
}

export class AuditLocatorService {
  /**
   * Scans all Page Objects in the project and audits their locator strategies.
   * Flags brittle XPaths and generates a Markdown report with recommendations.
   */
  public async audit(projectRoot: string, pagesRoot: string = 'pages'): Promise<LocatorAuditReport> {
    const pagesDir = path.join(projectRoot, pagesRoot);
    const pageFiles = await this.listTsFiles(pagesDir);

    const entries: LocatorAuditEntry[] = [];

    if (pageFiles.length > 0) {
      const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
      for (const f of pageFiles) {
        project.addSourceFileAtPath(f);
      }

      for (const sourceFile of project.getSourceFiles()) {
        for (const cls of sourceFile.getClasses()) {
          const className = cls.getName() ?? 'AnonymousClass';
          const relPath = path.relative(projectRoot, sourceFile.getFilePath());

          // BUG-08 FIX: Match all common WDIO selector call styles:
          //   $('sel')              — WDIO shorthand (original, still supported)
          //   driver.$('sel')       — WDIO v8 explicit driver reference
          //   browser.$('sel')      — WDIO browser global
          //   driver.findElement()  — W3C WebDriver API
          // Previously only $(...) was scanned — any modern project using driver.$ or
          // browser.$ returned 0 locators making the audit completely useless.
          const SELECTOR_PATTERN = /(?:(?:driver|browser)\.)?\$\(\s*['"`](.+?)['"`]\s*\)/;
          const SELECTOR_PATTERN_ALL = /(?:(?:driver|browser)\.)?\$\(\s*['"`](.+?)['"`]\s*\)/g;
          const FIND_ELEMENT_PATTERN = /(?:driver|browser)\.findElement\s*\(\s*['"`]?([^)]+?)['"`]?\s*\)/g;

          // Scan getters
          for (const getter of cls.getGetAccessors()) {
            const body = getter.getBody()?.getText() ?? '';
            const match = body.match(SELECTOR_PATTERN);
            if (match) {
              entries.push(this.classifyEntry(relPath, className, getter.getName(), match[1]));
            }
          }

          // Scan properties  
          for (const prop of cls.getProperties()) {
            const initializer = prop.getInitializer()?.getText() ?? '';
            const match = initializer.match(SELECTOR_PATTERN);
            if (match) {
              entries.push(this.classifyEntry(relPath, className, prop.getName(), match[1]));
            }
          }

          // Scan method bodies for inline selectors (all WDIO patterns + findElement)
          for (const method of cls.getMethods()) {
            const body = method.getBody()?.getText() ?? '';
            for (const m of body.matchAll(SELECTOR_PATTERN_ALL)) {
              entries.push(this.classifyEntry(relPath, className, `${method.getName()}() inline`, m[1]));
            }
            for (const m of body.matchAll(FIND_ELEMENT_PATTERN)) {
              entries.push(this.classifyEntry(relPath, className, `${method.getName()}() findElement`, m[1]));
            }
          }
        }
      }
    }

    const accessibilityIdCount = entries.filter(e => e.strategy === 'accessibility-id').length;
    const xpathCount = entries.filter(e => e.strategy === 'xpath').length;
    const otherCount = entries.length - accessibilityIdCount - xpathCount;

    const report: LocatorAuditReport = {
      totalLocators: entries.length,
      accessibilityIdCount,
      xpathCount,
      otherCount,
      entries,
      markdownReport: this.generateMarkdownReport(entries, accessibilityIdCount, xpathCount, otherCount)
    };

    return report;
  }

  private classifyEntry(file: string, className: string, locatorName: string, selector: string): LocatorAuditEntry {
    let strategy: string;
    let severity: 'ok' | 'warning' | 'critical';
    let recommendation: string;

    if (selector.startsWith('~')) {
      strategy = 'accessibility-id';
      severity = 'ok';
      recommendation = '✅ Stable — accessibility-id is the preferred strategy.';
    } else if (selector.startsWith('//')) {
      strategy = 'xpath';
      severity = 'critical';
      recommendation = '🔴 BRITTLE — XPath will break on UI changes. Add testID/accessibility-id to the app source.';
    } else if (selector.includes(':id/')) {
      strategy = 'resource-id';
      severity = 'warning';
      recommendation = '🟡 Acceptable — resource-id is stable but prefer accessibility-id for cross-platform.';
    } else if (selector.startsWith('-ios')) {
      strategy = 'ios-predicate';
      severity = 'warning';
      recommendation = '🟡 iOS only — consider adding accessibility-id for cross-platform support.';
    } else {
      strategy = 'other';
      severity = 'warning';
      recommendation = '🟡 Unknown strategy — verify this locator is stable across releases.';
    }

    return { file, className, locatorName, strategy, selector, severity, recommendation };
  }

  private generateMarkdownReport(
    entries: LocatorAuditEntry[],
    accessibilityIdCount: number,
    xpathCount: number,
    otherCount: number
  ): string {
    const lines: string[] = [
      '# 📊 Mobile Locator Audit Report',
      '',
      '## Summary',
      `| Strategy | Count | Health |`,
      `|----------|-------|--------|`,
      `| accessibility-id | ${accessibilityIdCount} | ✅ Stable |`,
      `| xpath | ${xpathCount} | 🔴 Brittle |`,
      `| other | ${otherCount} | 🟡 Review |`,
      '',
      `**Total Locators**: ${entries.length}`,
      `**Health Score**: ${entries.length > 0 ? Math.round((accessibilityIdCount / entries.length) * 100) : 0}% stable`,
      '',
    ];

    const criticals = entries.filter(e => e.severity === 'critical');
    if (criticals.length > 0) {
      lines.push('## 🔴 Critical — XPath Locators (Needs Developer Action)');
      lines.push('');
      lines.push('These locators will break when the UI changes. Ask developers to add `testID` (React Native) or `accessibilityIdentifier` (Swift/Kotlin) to these elements:');
      lines.push('');
      lines.push('| File | Class | Locator | Selector |');
      lines.push('|------|-------|---------|----------|');
      for (const e of criticals) {
        lines.push(`| ${e.file} | ${e.className} | ${e.locatorName} | \`${e.selector}\` |`);
      }
      lines.push('');
    }

    const warnings = entries.filter(e => e.severity === 'warning');
    if (warnings.length > 0) {
      lines.push('## 🟡 Warnings — Review Recommended');
      lines.push('');
      lines.push('| File | Class | Locator | Strategy | Recommendation |');
      lines.push('|------|-------|---------|----------|---------------|');
      for (const e of warnings) {
        lines.push(`| ${e.file} | ${e.className} | ${e.locatorName} | ${e.strategy} | ${e.recommendation} |`);
      }
    }

    return lines.join('\n');
  }

  private async listTsFiles(dir: string): Promise<string[]> {
    let results: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(await this.listTsFiles(fullPath));
        } else if (entry.name.endsWith('.ts')) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist
    }
    return results;
  }
}
