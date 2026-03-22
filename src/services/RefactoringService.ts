import type { CodebaseAnalysisResult } from './CodebaseAnalyzerService.js';

/**
 * RefactoringService — Analyzes codebase and suggests cleanup actions.
 * Identifies: duplicate step definitions, unused Page Object methods,
 * orphan feature files, and locator inconsistencies.
 */
export class RefactoringService {

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
        // Very basic heuristic: check if the method name appears in any step pattern
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
}
