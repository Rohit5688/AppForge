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
    // ISSUE #20 FIX: Read mcp-config.json to respect configured directories
    let config;
    let paths;
    try {
      config = this.configService.read(projectRoot);
      paths = this.configService.getPaths(config);
    } catch (err: any) {
      // If config doesn't exist, use defaults
      config = null;
      paths = {
        featuresRoot: 'src/features',
        stepsRoot: 'src/step-definitions',
        pagesRoot: 'src/pages',
        utilsRoot: 'src/utils',
        testDataRoot: 'src/test-data'
      };
    }
    
    // Pass paths to analyzer (which expects stepsRoot, not stepDefinitionsRoot)
    const analysis = await this.analyzerService.analyze(projectRoot, {
      featuresRoot: paths.featuresRoot,
      stepsRoot: paths.stepsRoot,
      pagesRoot: paths.pagesRoot,
      utilsRoot: paths.utilsRoot
    });

    // 1. Collect all project-local util method names
    const projectUtilMethods = new Set<string>();

    // From the codebase analyzer's existingUtils
    for (const utilFile of analysis.existingUtils) {
      for (const method of utilFile.publicMethods) {
        const namePart = method.includes('.') ? method.split('.')[1]! : method;
        projectUtilMethods.add(namePart.toLowerCase());
      }
    }

    // ISSUE #20 FIX: Build scan list from both config and conventional directories
    const candidateUtilDirs = new Set<string>();
    
    // Add configured directories from mcp-config.json
    if (config) {
      // Scan the pages directory (may contain helper methods)
      if (paths.pagesRoot) {
        candidateUtilDirs.add(path.join(projectRoot, paths.pagesRoot));
      }
      
      // Scan testData directory (often contains utilities)
      if (paths.testDataRoot) {
        candidateUtilDirs.add(path.join(projectRoot, paths.testDataRoot));
      }
      
      // Scan parent directory of testData (e.g., if testData is 'src/test-data', scan 'src/')
      if (paths.testDataRoot) {
        const parentDir = path.dirname(path.join(projectRoot, paths.testDataRoot));
        if (parentDir !== projectRoot) {
          candidateUtilDirs.add(parentDir);
        }
      }
    }
    
    // Add conventional util directories (including src/ and tests/ nests)
    const conventionalDirs = [
      'utils', 'helpers', 'support', 'lib',
      'src/utils', 'src/helpers', 'src/support', 'src/lib',
      'tests/utils', 'tests/helpers', 'tests/support'
    ];
    
    for (const dir of conventionalDirs) {
      candidateUtilDirs.add(path.join(projectRoot, dir));
    }
    
    // Filter to only existing directories
    const existingDirs = Array.from(candidateUtilDirs).filter(d => fs.existsSync(d));

    for (const utilsDir of existingDirs) {
      this.scanUtilsDir(utilsDir, projectUtilMethods);
    }

    // 2. Resolve custom wrapper package methods (BUG-12 FIX)
    const wrapperMethods = new Set<string>();
    let wrapperResolved = false;
    let wrapperInstalled = false;
    const resolvedWrapper = customWrapperPackage || (config as any)?.customWrapperPackage;

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

    // 3. Evaluate each Appium API surface entry (ISSUE #20: de-duplication via Set)
    const presentSet = new Set<string>();
    const coveredByWrapperSet = new Set<string>();
    const missing: UtilAuditEntry[] = [];
    const actionableSuggestions: string[] = [];

    for (const entry of APPIUM_API_SURFACE) {
      const allNames = [entry.method, ...entry.aliases].map(n => n.toLowerCase());

      const inProject = allNames.some(n => projectUtilMethods.has(n));
      const inWrapper = allNames.some(n => wrapperMethods.has(n));

      if (inProject) {
        presentSet.add(entry.method);
      } else if (inWrapper) {
        coveredByWrapperSet.add(entry.method);
        presentSet.add(entry.method); // counts toward coverage %
      } else {
        missing.push({
          method: entry.method,
          suggestedUtilClass: entry.suggestedUtilClass,
          source: 'missing'
        });
        actionableSuggestions.push(`Add ${entry.suggestedUtilClass}.${entry.method}() to ${entry.suggestedUtilClass}.ts`);
      }
    }
    
    // Convert Sets to Arrays for the result
    const present = Array.from(presentSet);
    const coveredByWrapper = Array.from(coveredByWrapperSet);

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
