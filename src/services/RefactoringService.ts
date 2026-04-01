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
    const stepMap = new Map<string, Set<string>>();
    for (const def of analysis.existingStepDefinitions) {
      for (const step of def.steps) {
        const key = `${step.type}:${step.pattern}`;
        const files = stepMap.get(key) || new Set<string>();
        files.add(def.file);
        stepMap.set(key, files);
      }
    }

    const duplicates = [...stepMap.entries()].filter(([_, files]) => files.size > 1);
    if (duplicates.length > 0) {
      suggestions.push('#### 👯 Duplicate Step Definitions');
      suggestions.push('The following steps have identical patterns in multiple files. This causes Cucumber compilation errors. **Merge these into a common steps file:**\n');
      for (const [pattern, files] of duplicates) {
        suggestions.push(`- **Pattern**: \`${pattern}\``);
        for (const f of Array.from(files)) {
          suggestions.push(`  - Found in: \`${f}\``);
        }
      }
      suggestions.push('');
    } else {
      suggestions.push('✅ No duplicate step definition patterns detected.');
    }

    // 2. Detect unused Page Object methods (not referenced by any step)
    const allStepBodies = analysis.existingStepDefinitions.flatMap(d => d.steps.map(s => (s.bodyText || '').toLowerCase()));
    const unusedPomMethods: { page: string; methods: string[]; confidence: 'low' | 'medium' | 'high' }[] = [];

    for (const po of analysis.existingPageObjects) {
      const unused = po.publicMethods.filter(method => {
        const methodLower = method.toLowerCase();
        
        // Strategy 1: Simple substring match (lowest confidence)
        const simpleMatch = allStepBodies.some(body => body.includes(methodLower));
        if (simpleMatch) return false;
        
        // Strategy 2: Instance variable pattern (e.g., "loginPage.method()")
        const instanceMatch = allStepBodies.some(body => {
          const instancePattern = new RegExp(`\\w+\\.${methodLower}\\s*\\(`, 'i');
          return instancePattern.test(body);
        });
        if (instanceMatch) return false;
        
        // Strategy 3: await pattern (e.g., "await page.method()")
        const awaitMatch = allStepBodies.some(body => {
          return body.includes('await') && body.includes(methodLower);
        });
        if (awaitMatch) return false;
        
        // Strategy 4: Common wrapper patterns (e.g., "wrapperFn(page.method)")
        const wrapperMatch = allStepBodies.some(body => {
          const wrapperPattern = new RegExp(`\\w+\\(.*${methodLower}.*\\)`, 'i');
          return wrapperPattern.test(body);
        });
        if (wrapperMatch) return false;
        
        // If all strategies failed, likely unused
        return true;
      });
      
      if (unused.length > 0) {
        // Calculate confidence based on ratio of unused to total methods
        const unusedRatio = unused.length / Math.max(po.publicMethods.length, 1);
        let confidence: 'low' | 'medium' | 'high';
        
        if (unusedRatio > 0.8) {
          // If >80% of methods flagged, likely all are false positives
          confidence = 'low';
        } else if (unusedRatio > 0.5) {
          // If 50-80% flagged, medium confidence
          confidence = 'medium';
        } else {
          // If <50% flagged, higher confidence these are truly unused
          confidence = 'high';
        }
        
        unusedPomMethods.push({ page: po.path, methods: unused, confidence });
      }
    }

    if (unusedPomMethods.length > 0) {
      suggestions.push('#### 🗑️ Potentially Unused Page Object Methods');
      suggestions.push('> [!WARNING]\n> **False-Positive Risk:** This analysis uses pattern matching on step definition bodies. Methods called indirectly (via wrappers, inheritance, or dynamic calls) might be incorrectly flagged. **Always verify manually before deleting.**\n');
      
      // Group by confidence level
      const highConfidence = unusedPomMethods.filter(p => p.confidence === 'high');
      const mediumConfidence = unusedPomMethods.filter(p => p.confidence === 'medium');
      const lowConfidence = unusedPomMethods.filter(p => p.confidence === 'low');
      
      if (highConfidence.length > 0) {
        suggestions.push('**High Confidence** (likely genuinely unused):\n');
        for (const po of highConfidence) {
          for (const method of po.methods) {
            suggestions.push(`- **${method}** (File: \`${po.page}\`) ✓`);
          }
        }
        suggestions.push('');
      }
      
      if (mediumConfidence.length > 0) {
        suggestions.push('**Medium Confidence** (verify before deleting):\n');
        for (const po of mediumConfidence) {
          for (const method of po.methods) {
            suggestions.push(`- **${method}** (File: \`${po.page}\`) ⚠️`);
          }
        }
        suggestions.push('');
      }
      
      if (lowConfidence.length > 0) {
        suggestions.push('**Low Confidence** (likely false positives - most/all methods flagged):\n');
        for (const po of lowConfidence) {
          suggestions.push(`- Page \`${po.page}\`: ${po.methods.length} methods flagged (likely incorrect - verify page object is properly imported)`);
        }
        suggestions.push('');
      }
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
