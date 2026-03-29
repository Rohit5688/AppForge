import fs from 'fs';
import path from 'path';
import { APPIUM_API_SURFACE } from '../data/appiumApiSurface.js';
import { CodebaseAnalyzerService } from './CodebaseAnalyzerService.js';
import { McpConfigService } from './McpConfigService.js';

export interface UtilAuditEntry {
  method: string;
  category?: string;
  suggestedUtilClass: string;
  description?: string;
  source: 'project-utils' | 'custom-wrapper' | 'missing';
}

export interface UtilAuditResult {
  coveragePercent: number;
  present: string[];
  coveredByWrapper: string[];
  missing: UtilAuditEntry[];
  actionableSuggestions: string[];
  customWrapperNote?: string;
}

/**
 * BUG-12 FIX: AppForge UtilAuditService was entirely unaware of custom wrapper packages.
 * Teams using a shared library (e.g. @company/appium-helpers) received 100% false
 * "missing" results for every method their shared library already provides.
 *
 * Now mirrors TestForge's UtilAuditService wrapper-aware deduction pattern:
 *  1. Scans project-local util dirs (utils/, helpers/, support/, lib/) for method names.
 *  2. Optionally resolves a customWrapperPackage from node_modules and scans its exports.
 *  3. Methods found in the wrapper are counted as 'present' (coveredByWrapper) and excluded
 *     from the 'missing' list — preventing the false 100%-missing reports.
 */
export class UtilAuditService {
  private analyzerService = new CodebaseAnalyzerService();
  private configService = new McpConfigService();

  async audit(projectRoot: string, customWrapperPackage?: string): Promise<UtilAuditResult> {
    const config = this.configService.read(projectRoot);
    const paths = this.configService.getPaths(config);
    const analysis = await this.analyzerService.analyze(projectRoot, paths);

    // 1. Collect all project-local util method names
    const projectUtilMethods = new Set<string>();

    // From the codebase analyzer's existingUtils
    for (const utilFile of analysis.existingUtils) {
      for (const method of utilFile.publicMethods) {
        const namePart = method.includes('.') ? method.split('.')[1]! : method;
        projectUtilMethods.add(namePart.toLowerCase());
      }
    }

    // Also scan conventional util dirs by convention (utils/, helpers/, support/, lib/)
    const candidateUtilDirs = ['utils', 'helpers', 'support', 'lib']
      .map(d => path.join(projectRoot, d))
      .filter(d => fs.existsSync(d));

    for (const utilsDir of candidateUtilDirs) {
      this.scanUtilsDir(utilsDir, projectUtilMethods);
    }

    // 2. Resolve custom wrapper package methods (BUG-12 FIX)
    const wrapperMethods = new Set<string>();
    let wrapperResolved = false;
    let wrapperInstalled = false;
    const resolvedWrapper = customWrapperPackage || (config as any).customWrapperPackage;

    if (resolvedWrapper) {
      wrapperResolved = true;
      try {
        // Try to find the package in node_modules
        const wrapperRoot = path.join(projectRoot, 'node_modules', resolvedWrapper);
        if (fs.existsSync(wrapperRoot)) {
          wrapperInstalled = true;
          this.scanUtilsDir(wrapperRoot, wrapperMethods);
        }
      } catch {
        // Wrapper not installed — will surface as a note below
      }
    }

    // 3. Evaluate each Appium API surface entry
    const present: string[] = [];
    const coveredByWrapper: string[] = [];
    const missing: UtilAuditEntry[] = [];
    const actionableSuggestions: string[] = [];

    for (const entry of APPIUM_API_SURFACE) {
      const allNames = [entry.method, ...entry.aliases].map(n => n.toLowerCase());

      const inProject = allNames.some(n => projectUtilMethods.has(n));
      const inWrapper = allNames.some(n => wrapperMethods.has(n));

      if (inProject) {
        present.push(entry.method);
      } else if (inWrapper) {
        coveredByWrapper.push(entry.method);
        present.push(entry.method); // counts toward coverage %
      } else {
        missing.push({
          method: entry.method,
          suggestedUtilClass: entry.suggestedUtilClass,
          source: 'missing'
        });
        actionableSuggestions.push(`Add ${entry.suggestedUtilClass}.${entry.method}() to ${entry.suggestedUtilClass}.ts`);
      }
    }

    const total = present.length + missing.length;
    const coveragePercent = Math.round((present.length / (total || 1)) * 100);

    const customWrapperNote = wrapperResolved
      ? wrapperInstalled
        ? `✅ Custom wrapper "${resolvedWrapper}" detected — ${coveredByWrapper.length} method(s) provided by wrapper, counted as present.`
        : `⚠️ Custom wrapper "${resolvedWrapper}" specified but not found in node_modules. Install it to get accurate coverage.`
      : undefined;

    return {
      coveragePercent,
      present,
      coveredByWrapper,
      missing,
      actionableSuggestions,
      ...(customWrapperNote ? { customWrapperNote } : {})
    };
  }

  /**
   * Recursively scans a utils/lib directory and collects all exported function
   * and class method names. Uses lightweight regex (fast, no ts-morph overhead).
   */
  private scanUtilsDir(dir: string, methodNames: Set<string>): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        this.scanUtilsDir(fullPath, methodNames);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        this.extractMethodsFromFile(fullPath, methodNames);
      } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) {
        this.extractMethodsFromFile(fullPath, methodNames);
      }
    }
  }

  private extractMethodsFromFile(filePath: string, methodNames: Set<string>): void {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }

    // Class methods: async navigate(...) { or public click(...) {
    const methodMatches = content.matchAll(/(?:public\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/g);
    for (const m of methodMatches) {
      if (m[1] && !['if', 'for', 'while', 'switch', 'catch', 'constructor', 'describe', 'it', 'test'].includes(m[1])) {
        methodNames.add(m[1].toLowerCase());
      }
    }

    // Exported arrow functions: export const navigate = async (...) =>
    const arrowMatches = content.matchAll(/export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(/g);
    for (const m of arrowMatches) {
      if (m[1]) methodNames.add(m[1].toLowerCase());
    }

    // Exported named functions: export function navigate(...)
    const fnMatches = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)\s*\(/g);
    for (const m of fnMatches) {
      if (m[1]) methodNames.add(m[1].toLowerCase());
    }
  }
}
