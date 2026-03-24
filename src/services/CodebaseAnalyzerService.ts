import path from 'path';
import { Project, SyntaxKind, Node } from 'ts-morph';
import fs from 'fs/promises';

export type ArchitecturePattern = 'pom' | 'yaml-locators' | 'facade' | 'hybrid';

export interface CodebaseAnalysisResult {
  existingFeatures: string[];
  existingStepDefinitions: {
    file: string;
    steps: { type: string; pattern: string }[];
  }[];
  existingPageObjects: {
    path: string;
    className: string;
    publicMethods: string[];
    locators: { name: string; strategy: string; selector: string }[];
  }[];
  existingUtils: {
    path: string;
    publicMethods: string[];
  }[];
  conflicts: {
    pattern: string;
    files: string[];
  }[];
  /** Detected project architecture — drives how code is generated */
  architecturePattern: ArchitecturePattern;
  /** YAML locator files found (e.g., locators/login.yaml) */
  yamlLocatorFiles: string[];
  /** Dynamically calculated workspace directories based on file locations */
  detectedPaths: {
    featuresRoot: string;
    stepsRoot: string;
    pagesRoot: string;
    utilsRoot: string;
    locatorsRoot: string;
  };
}

export class CodebaseAnalyzerService {
  /**
   * Scans the project for existing BDD assets using ts-morph AST parsing.
   * Scans features/, step-definitions/, pages/, and utils/.
   */
  public async analyze(projectRoot: string): Promise<CodebaseAnalysisResult> {
    const result: CodebaseAnalysisResult = {
      existingFeatures: [],
      existingStepDefinitions: [],
      existingPageObjects: [],
      existingUtils: [],
      conflicts: [],
      architecturePattern: 'pom',
      yamlLocatorFiles: [],
      detectedPaths: {
        featuresRoot: 'features',
        stepsRoot: 'step-definitions',
        pagesRoot: 'pages',
        utilsRoot: 'utils',
        locatorsRoot: 'locators'
      }
    };

    // 1. Discover Feature files anywhere in the workspace
    const featureFiles = await this.listFilesWithExtensions(projectRoot, ['.feature']);
    result.existingFeatures = featureFiles.map(f => path.relative(projectRoot, f));

    if (featureFiles.length > 0) {
      result.detectedPaths.featuresRoot = path.dirname(path.relative(projectRoot, featureFiles[0]));
    }

    // 2. Discover ALL TypeScript Files dynamically
    const tsFiles = await this.listFilesWithExtensions(projectRoot, ['.ts']);
    if (tsFiles.length > 0) {
      const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
      for (const f of tsFiles) {
        if (f.includes('mcp-config') || f.includes('wdio.conf') || f.endsWith('d.ts')) continue;
        project.addSourceFileAtPath(f);
      }

      for (const sourceFile of project.getSourceFiles()) {
        const filePath = sourceFile.getFilePath();
        const relativePath = path.relative(projectRoot, filePath);
        const codeContent = sourceFile.getFullText();

        const steps = this.extractStepsAST(sourceFile);
        if (steps.length > 0) {
          result.existingStepDefinitions.push({ file: relativePath, steps });
          if (result.detectedPaths.stepsRoot === 'step-definitions') {
             result.detectedPaths.stepsRoot = path.dirname(relativePath);
          }
          continue;
        }

        const classes = sourceFile.getClasses();
        let isPageObject = false;
        for (const cls of classes) {
          const className = cls.getName() || '';
          const hasLocators = this.extractLocatorsAST(cls).length > 0;
          const isStandardPom = className.toLowerCase().includes('page') || className.toLowerCase().includes('screen');
          if (hasLocators || isStandardPom) {
            const publicMethods = cls.getMethods()
              .filter(m => !m.hasModifier(SyntaxKind.PrivateKeyword) && !m.hasModifier(SyntaxKind.ProtectedKeyword))
              .map(m => m.getName());
            result.existingPageObjects.push({
              path: relativePath,
              className: className || 'AnonymousClass',
              publicMethods,
              locators: this.extractLocatorsAST(cls)
            });
            isPageObject = true;
          }
        }

        if (isPageObject) {
          if (result.detectedPaths.pagesRoot === 'pages') {
             result.detectedPaths.pagesRoot = path.dirname(relativePath);
          }
          continue;
        }

        if (relativePath.toLowerCase().includes('util') || codeContent.includes('export function') || codeContent.includes('export const')) {
          const methods: string[] = [];
          for (const cls of classes) {
            for (const m of cls.getMethods()) {
              if (!m.hasModifier(SyntaxKind.PrivateKeyword)) methods.push(`${cls.getName()}.${m.getName()}`);
            }
          }
          for (const fn of sourceFile.getFunctions()) {
            if (fn.isExported()) methods.push(fn.getName() ?? 'anonymous');
          }
          if (methods.length > 0) {
            result.existingUtils.push({ path: relativePath, publicMethods: methods });
            if (result.detectedPaths.utilsRoot === 'utils') {
               result.detectedPaths.utilsRoot = path.dirname(relativePath);
            }
          }
        }
      }
    }

    // 5. Detect Architecture Pattern
    result.architecturePattern = await this.detectArchitecture(projectRoot, result);

    if (result.yamlLocatorFiles.length > 0) {
      result.detectedPaths.locatorsRoot = path.dirname(path.relative(projectRoot, result.yamlLocatorFiles[0]));
    }

    // 6. Detect Step Rule Conflicts
    const patternMap = new Map<string, string[]>();
    for (const stepDef of result.existingStepDefinitions) {
      for (const step of stepDef.steps) {
        const key = `${step.type}: ${step.pattern}`;
        const existing = patternMap.get(key) || [];
        existing.push(stepDef.file);
        patternMap.set(key, existing);
      }
    }

    for (const [pattern, files] of patternMap.entries()) {
      if (files.length > 1) {
        result.conflicts.push({ pattern, files: [...new Set(files)] });
      }
    }

    return result;
  }

  // ─── Architecture Detection ────────────────────────────

  /**
   * Detects the project's locator architecture by scanning for:
   * - YAML locator files → 'yaml-locators'
   * - Page Object classes with inline selectors → 'pom'
   * - driverFacade/resolveLocator usage → 'facade'
   * - Mix of patterns → 'hybrid'
   */
  private async detectArchitecture(
    projectRoot: string,
    analysis: CodebaseAnalysisResult
  ): Promise<ArchitecturePattern> {
    let hasYaml = false;
    let hasPom = false;
    let hasFacade = false;

    // 1. Check for YAML locator files everywhere in the workspace
    const yamlFiles = await this.listFilesWithExtensions(projectRoot, ['.yaml', '.yml']);
    
    // Filter out irrelevant yaml files like CI workflows or docker-compose
    const validYamlLocators = yamlFiles.filter(f => {
      const name = path.basename(f).toLowerCase();
      return !name.includes('github') && !name.includes('gitlab') && !name.includes('docker') && !f.includes('node_modules');
    });

    if (validYamlLocators.length > 0) {
      hasYaml = true;
      analysis.yamlLocatorFiles = validYamlLocators;
    }

    // 2. Check for POM patterns (page classes with inline $() selectors or decorators)
    if (analysis.existingPageObjects.length > 0) {
      const hasInlineLocators = analysis.existingPageObjects.some(p => p.locators.length > 0);
      if (hasInlineLocators) hasPom = true;
    }

    // 3. Check for Facade/resolveLocator patterns across ALL discovered ts files
    const tsFiles = await this.listFilesWithExtensions(projectRoot, ['.ts']);
    for (const f of tsFiles) {
      if (f.includes('node_modules') || f.includes('.d.ts')) continue;
      try {
        const content = await fs.readFile(f, 'utf8');
        if (
          content.includes('resolveLocator') ||
          content.includes('driverFacade') ||
          content.includes('LocatorService') ||
          content.includes('getLocator(')
        ) {
          hasFacade = true;
          break;
        }
      } catch { /* skip unreadable files */ }
    }

    // 4. Classify
    if (hasYaml && hasFacade) return 'yaml-locators';
    if (hasYaml && hasPom) return 'hybrid';
    if (hasYaml) return 'yaml-locators';
    if (hasFacade) return 'facade';
    return 'pom';
  }

  private async listFilesWithExtensions(dir: string, extensions: string[]): Promise<string[]> {
    let results: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(await this.listFilesWithExtensions(fullPath, extensions));
        } else if (extensions.some(ext => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    } catch { /* directory doesn't exist */ }
    return results;
  }

  // ─── AST Extractors ───────────────────────────────────

  /**
   * Uses AST to find Given/When/Then calls with their patterns.
   */
  private extractStepsAST(sourceFile: any): { type: string; pattern: string }[] {
    const steps: { type: string; pattern: string }[] = [];
    const stepTypes = ['Given', 'When', 'Then', 'And', 'But'];

    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach((call: any) => {
      const exprText = call.getExpression().getText();
      if (stepTypes.includes(exprText)) {
        const args = call.getArguments();
        if (args.length > 0) {
          let pattern = args[0].getText();
          // Remove quotes/backticks/regex delimiters
          pattern = pattern.replace(/^['"`\/]|['"`\/]$/g, '');
          steps.push({ type: exprText, pattern });
        }
      }
    });

    return steps;
  }

  /**
   * Extracts locator patterns from page object getters/properties.
   */
  private extractLocatorsAST(cls: any): { name: string; strategy: string; selector: string }[] {
    const locators: { name: string; strategy: string; selector: string }[] = [];

    // Look for getter accessors that return $() or $$()
    for (const getter of cls.getGetAccessors()) {
      const body = getter.getBody()?.getText() ?? '';
      const selectorMatch = body.match(/\$\(\s*['"`](.+?)['"`]\s*\)/);
      if (selectorMatch) {
        const selector = selectorMatch[1];
        locators.push({
          name: getter.getName(),
          strategy: this.classifyLocatorStrategy(selector),
          selector
        });
      }
    }

    // Also look for properties with $ calls
    for (const prop of cls.getProperties()) {
      const initializer = prop.getInitializer()?.getText() ?? '';
      const selectorMatch = initializer.match(/\$\(\s*['"`](.+?)['"`]\s*\)/);
      if (selectorMatch) {
        const selector = selectorMatch[1];
        locators.push({
          name: prop.getName(),
          strategy: this.classifyLocatorStrategy(selector),
          selector
        });
      }
    }

    return locators;
  }

  /**
   * Classifies a selector string into its locator strategy.
   */
  private classifyLocatorStrategy(selector: string): string {
    if (selector.startsWith('~')) return 'accessibility-id';
    if (selector.startsWith('//')) return 'xpath';
    if (selector.startsWith('#')) return 'id';
    if (selector.startsWith('.')) return 'class';
    if (selector.includes(':id/')) return 'resource-id';
    if (selector.startsWith('-ios')) return 'ios-predicate';
    return 'unknown';
  }

  // ─── File Discovery Helpers ───────────────────────────

  private async listFiles(dir: string, ext: string, projectRoot: string): Promise<string[]> {
    const absolute = await this.listFilesAbsolute(dir, ext);
    return absolute.map(f => path.relative(projectRoot, f));
  }

  private async listFilesAbsolute(dir: string, ext: string): Promise<string[]> {
    let results: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(await this.listFilesAbsolute(fullPath, ext));
        } else if (entry.name.endsWith(ext)) {
          results.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist — fine
    }
    return results;
  }
}
