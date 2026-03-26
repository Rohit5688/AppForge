import type { AppiumSessionService } from './AppiumSessionService.js';
import type { LearningService } from './LearningService.js';
import type { CodebaseAnalysisResult } from './CodebaseAnalyzerService.js';
import fs from 'fs';
import path from 'path';

export interface HealingInstruction {
  rootCause: 'locator' | 'sync' | 'interaction' | 'app_bug';
  failedSelector?: string;
  fixDescription: string;
  proposedChange?: {
    file: string;
    original: string;
    replacement: string;
  };
  alternativeSelectors?: string[];
}

export interface SelectorVerification {
  selector: string;
  exists: boolean;
  displayed: boolean;
  enabled: boolean;
  tagName?: string;
  text?: string;
}

export type RiskLevel = 'high' | 'medium' | 'low';

export interface FlakinessRisk {
  elementOrStep: string;
  file: string;
  riskLevel: RiskLevel;
  reason: string;
  recommendation: string;
}

export interface FlakinessReport {
  schemaVersion: '1.0.0';
  projectRoot: string;
  totalRisks: number;
  highRiskCount: number;
  mediumRiskCount: number;
  lowRiskCount: number;
  risks: FlakinessRisk[];
  overallHealth: string;
}

export class SelfHealingService {
  private sessionService: AppiumSessionService | null = null;
  private learningService: LearningService | null = null;

  /** Inject a live session for selector verification. */
  public setSessionService(service: AppiumSessionService): void {
    this.sessionService = service;
  }

  public setLearningService(service: LearningService): void {
    this.learningService = service;
  }

  /** Auto-learns a successful selector fix. */
  public async reportHealSuccess(projectRoot: string, oldSelector: string, newSelector: string): Promise<void> {
    if (this.learningService) {
      try {
        await this.learningService.learn(
          projectRoot,
          `Self-Heal Rule: Use \`${newSelector}\` instead of \`${oldSelector}\``,
          'auto_healed'
        );
      } catch (e) {
        // Non-fatal: validation may reject the rule (e.g., selector exceeds max length)
        console.error('[SelfHeal] Failed to auto-learn selector fix:', (e as Error).message);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Wave 2 — Phase 3.1: Preventive Flakiness Detection
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Scans existing test patterns and locators to predict which ones are likely to flake.
   */
  public async predictFlakiness(projectRoot: string, analysis: CodebaseAnalysisResult): Promise<FlakinessReport> {
    const risks: FlakinessRisk[] = [];

    // 1. Analyze Page Object Locators
    for (const po of analysis.existingPageObjects) {
      for (const loc of po.locators) {
        let riskLevel: RiskLevel = 'low';
        let reason = '';
        let recommendation = '';

        if (loc.strategy === 'xpath') {
          // Check if it's a long absolute/brittle xpath
          if (loc.selector.split('/').length > 3 || loc.selector.includes('*[')) {
             riskLevel = 'high';
             reason = 'Complex/deep XPath locator. Highly sensitive to DOM/UI tree changes.';
             recommendation = 'Switch to accessibility-id or a semantic data-testid attribute.';
          } else {
             riskLevel = 'medium';
             reason = 'XPath locator. Prone to breaking across platforms or minor UI updates.';
             recommendation = 'Replace with a more robust strategy like resource-id or accessibility-id.';
          }
        } else if (loc.strategy === 'resource-id') {
          // Resource-IDs are better but platform specific usually
          riskLevel = 'low';
        } else if (loc.strategy === 'accessibility-id') {
          riskLevel = 'low';
        } else if (loc.strategy === 'ios-predicate') {
           if (loc.selector.includes('CONTAINS') || loc.selector.includes('MATCHES')) {
              riskLevel = 'medium';
              reason = 'Fuzzy iOS predicate matching (CONTAINS/MATCHES) can match multiple elements or break on localization changes.';
              recommendation = 'Use exact string matching (==) or prefer accessibility-id.';
           }
        } else {
           riskLevel = 'medium';
           reason = `Custom or ambiguous strategy "${loc.strategy}". Might not be cross-platform safe.`;
           recommendation = 'Verify stability and prefer standard Appium locator strategies.';
        }

        if (riskLevel !== 'low') {
          risks.push({
            elementOrStep: `${po.className}.${loc.name}`,
            file: po.path,
            riskLevel,
            reason,
            recommendation
          });
        }
      }
    }

    // 2. Discover .ts files to scan for Sync code and Hardcoded waits
    let tsFiles: string[] = [];
    try {
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (['node_modules', 'dist', '.git'].includes(entry.name)) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) tsFiles.push(full);
        }
      };
      walk(projectRoot);
    } catch {}

    for (const file of tsFiles) {
      const rel = path.relative(projectRoot, file).replace(/\\/g, '/');
      try {
        const content = fs.readFileSync(file, 'utf8');
        
        // Anti-pattern: hardcoded sleep/pause
        if (/\bbrowser\.pause\s*\(\s*\d+\s*\)/.test(content) || /\bawait\s+delay\s*\(\s*\d+\s*\)/.test(content) || /\bsleep\s*\(\s*\d+\s*\)/.test(content)) {
           risks.push({
             elementOrStep: 'Hardcoded Sleep',
             file: rel,
             riskLevel: 'high',
             reason: 'Hardcoded wait times (e.g. browser.pause, sleep) guarantee slow tests and random failures when the app is slower than the wait time.',
             recommendation: 'Replace with dynamic waits: waitForDisplayed(), waitForClickable(), or standard WDIO expect() assertions.'
           });
        }

        // Anti-pattern: missing await on actionable elements
        if (/(?<!await\s+)(\$\([^)]+\)|\w+\.\$)\.(click|setValue|getText|waitForDisplayed)\(/.test(content)) {
          risks.push({
             elementOrStep: 'Missing `await`',
             file: rel,
             riskLevel: 'high',
             reason: 'Actionable WebdriverIO commands (click, setValue) are being called without `await`. Execution will proceed before the action finishes, causing flaky state.',
             recommendation: 'Ensure all async WebdriverIO API calls are prefixed with `await`.'
          });
        }
      } catch {}
    }

    // De-duplicate findings (simplistic)
    const uniqueRisks = Array.from(new Map(risks.map(r => [`${r.file}-${r.elementOrStep}-${r.reason}`, r])).values());
    
    // Sort
    const order: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 };
    uniqueRisks.sort((a, b) => order[a.riskLevel] - order[b.riskLevel]);

    const highRiskCount = uniqueRisks.filter(r => r.riskLevel === 'high').length;
    const mediumRiskCount = uniqueRisks.filter(r => r.riskLevel === 'medium').length;
    
    let health = 'Good';
    if (highRiskCount > 0) health = 'Poor - High risk of flakiness';
    else if (mediumRiskCount > 5) health = 'Fair - Needs improvement';

    return {
      schemaVersion: '1.0.0',
      projectRoot,
      totalRisks: uniqueRisks.length,
      highRiskCount,
      mediumRiskCount,
      lowRiskCount: uniqueRisks.filter(r => r.riskLevel === 'low').length,
      risks: uniqueRisks,
      overallHealth: health
    };
  }

  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Analyzes a Mobile Automation test failure using XML Hierarchy + Screenshots.
   * Parses the failure output to identify the broken selector, then scans XML for alternatives.
   */
  public async analyzeMobileFailure(
    testOutput: string,
    xmlHierarchy: string,
    screenshotBase64: string
  ): Promise<HealingInstruction> {
    // 1. Classify the root cause
    const isLocatorIssue = /NoSuchElementError|element.*not.*found|stale element/i.test(testOutput);
    const isInteractionIssue = /not clickable|intercepted|obscured|failed to click|tap failed/i.test(testOutput);
    const isSyncIssue = /timeout|ETIMEDOUT|navigation timeout|waitFor/i.test(testOutput) && !isLocatorIssue;

    if (isInteractionIssue) {
      return {
        rootCause: 'interaction',
        fixDescription: 'The element was found but the interaction (click/tap) failed. This usually means the element is obscured, disabled, or requires a platform-specific tap strategy (e.g., mobile: tap for iOS).'
      };
    }

    if (!isLocatorIssue && !isSyncIssue) {
      return {
        rootCause: 'app_bug',
        fixDescription: 'The test failed with a non-locator, non-sync error. Analyze the logs and UI state to identify the application-level discrepancy.'
      };
    }

    if (isSyncIssue) {
      return {
        rootCause: 'sync',
        fixDescription: 'The failure appears to be a timing/synchronization issue. Consider adding explicit waits or increasing timeout values.'
      };
    }

    // 2. Extract the failed selector from the error output
    const failedSelector = this.extractFailedSelector(testOutput);

    // 3. Scan XML hierarchy for alternative selectors
    const alternativeSelectors = this.findAlternatives(xmlHierarchy, failedSelector);

    // 4. If live session available, verify which alternatives actually exist on device
    if (this.sessionService?.isSessionActive() && alternativeSelectors.length > 0) {
      const verified: SelectorVerification[] = [];
      for (const sel of alternativeSelectors) {
        const result = await this.sessionService.verifySelector(sel);
        verified.push({ selector: sel, ...result });
      }
      const validSelectors = verified.filter(v => v.exists).map(v => v.selector);
      if (validSelectors.length > 0) {
        return {
          rootCause: 'locator',
          failedSelector,
          fixDescription: `The element with selector "${failedSelector}" was not found. ${validSelectors.length} alternative(s) VERIFIED on live device.`,
          alternativeSelectors: validSelectors
        };
      }
    }

    return {
      rootCause: 'locator',
      failedSelector,
      fixDescription: `The element with selector "${failedSelector}" was not found in the current UI hierarchy. ${alternativeSelectors.length > 0 ? 'Alternative selectors have been identified from the XML tree.' : 'No close matches found — the element may have been removed or renamed.'}`,
      alternativeSelectors
    };
  }

  /**
   * Generates a Vision-Enriched prompt for the LLM to heal the mobile locator.
   * Includes the XML tree, parsed elements, AND a reference to the Base64 screenshot.
   */
  public buildVisionHealPrompt(
    instruction: HealingInstruction,
    xml: string,
    screenshotBase64?: string
  ): string {
    const alternativesBlock = instruction.alternativeSelectors?.length
      ? `### 🎯 SUGGESTED ALTERNATIVES (from XML)\n${instruction.alternativeSelectors.map((s, i) => `${i + 1}. \`${s}\``).join('\n')}\n`
      : '### ⚠️ No close matches found in XML. The element may have been removed.\n';

    // Prune XML to keep only interactive/identifiable elements (prevents LLM context overflow)
    const prunedXml = this.pruneXml(xml);

    return `
You are an AI Self-Healing agent for Mobile Automation (Appium + WebdriverIO).
A test has failed and needs to be corrected.

### 📜 FAILURE CONTEXT
- **Root Cause**: ${instruction.rootCause}
- **Failed Selector**: \`${instruction.failedSelector ?? 'unknown'}\`
- **Description**: ${instruction.fixDescription}

${alternativesBlock}
### 🌳 DEVICE UI HIERARCHY (Pruned — interactive elements only)
\`\`\`xml
${prunedXml}
\`\`\`
${xml.length > 10000 ? '... (truncated, full XML was ' + xml.length + ' chars)' : ''}

${screenshotBase64 ? '### 🖼️ VISION CONTEXT\nA Base64 screenshot of the current device state is attached. Use it to visually identify the target element.\n' : ''}
### 🎯 YOUR TASK
1. Analyze the XML hierarchy and the screenshot to find the element the test was trying to interact with.
2. Determine if the issue is the **Selector** or the **Interaction Strategy**.
3. **Architectural Awareness**: Check if the project uses YAML-based locators or a Facade/Wrapper. If so, provide the fix in that style.
4. **Interaction Fix**: If the root cause is 'interaction', suggest using \`ActionsUtils.forceClick()\`, \`mobile: tap\`, or ensuring the element is in view.
5. Return ONLY a JSON object:
\`\`\`json
{
  "healedSelector": "~newAccessibilityId",
  "healedInteraction": "click|tap|mobileTap|scrollAndClick",
  "strategy": "accessibility-id|facade-update|yaml-locator",
  "confidence": "high|medium|low",
  "explanation": "Why this fix was chosen"
}
\`\`\`
`;
  }

  /**
   * Orchestrates a self-healing retry loop:
   * analyze failure → build heal prompt → (LLM heals) → rewrite → re-run
   * Returns the healing instruction for the LLM at each step.
   */
  public async healWithRetry(
    testOutput: string,
    xmlHierarchy: string,
    screenshotBase64: string,
    attempt: number = 1,
    maxAttempts: number = 3
  ): Promise<{ instruction: HealingInstruction; prompt: string; attempt: number; exhausted: boolean }> {
    // If live session is available, use fresh data instead of stale input
    let xml = xmlHierarchy;
    let screenshot = screenshotBase64;
    if (this.sessionService?.isSessionActive()) {
      try {
        xml = await this.sessionService.getPageSource();
        screenshot = await this.sessionService.takeScreenshot();
      } catch {
        // Fall back to provided data
      }
    }

    const instruction = await this.analyzeMobileFailure(testOutput, xml, screenshot);
    const prompt = this.buildVisionHealPrompt(instruction, xml, screenshot);

    return {
      instruction,
      prompt,
      attempt,
      exhausted: attempt >= maxAttempts
    };
  }

  /**
   * Verifies a healed selector against the live device.
   * Call after the LLM proposes a fix to confirm it works.
   */
  public async verifyHealedSelector(selector: string): Promise<SelectorVerification> {
    if (!this.sessionService?.isSessionActive()) {
      return { selector, exists: false, displayed: false, enabled: false };
    }
    const result = await this.sessionService.verifySelector(selector);
    return { selector, ...result };
  }

  // ─── Private Helpers ───────────────────────────────────

  /**
   * Extracts the failed selector from Appium/WebdriverIO error output.
   */
  private extractFailedSelector(output: string): string {
    // Pattern: "selector: '~loginButton'" or 'using selector "//xpath"'
    const patterns = [
      /selector:\s*['"`](.+?)['"`]/,
      /using\s+(?:selector|locator)\s*['"`](.+?)['"`]/i,
      /\$\(\s*['"`](.+?)['"`]\s*\)/,
      /element\s+['"`](.+?)['"`]\s+(?:not found|wasn't found)/i
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) return match[1];
    }

    return 'unknown';
  }

  /**
   * Scans the XML hierarchy for elements that could be alternatives to the failed selector.
   */
  private findAlternatives(xml: string, failedSelector: string): string[] {
    const alternatives: string[] = [];
    if (!failedSelector || failedSelector === 'unknown') return alternatives;

    // Extract the "intent" from the failed selector (e.g., "login" from "~loginButton")
    const intent = failedSelector
      .replace(/^[~#/.]/, '')
      .replace(/^\/+/, '')
      .replace(/\[.*?\]/g, '')
      .toLowerCase();

    // Search XML for elements with matching content-desc, resource-id, or text
    const patterns = [
      /content-desc="([^"]*)"/g,
      /resource-id="([^"]*)"/g,
      /text="([^"]*)"/g,
      /accessibility-id="([^"]*)"/g,
      /name="([^"]*)"/g
    ];

    const seen = new Set<string>();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(xml)) !== null) {
        const value = match[1];
        if (value && value.toLowerCase().includes(intent) && !seen.has(value)) {
          seen.add(value);
          // Determine the best selector strategy for this match
          if (match[0].startsWith('content-desc') || match[0].startsWith('accessibility-id') || match[0].startsWith('name')) {
            alternatives.push(`~${value}`);
          } else if (match[0].startsWith('resource-id')) {
            alternatives.push(value);
          } else {
            alternatives.push(`~${value}`);
          }
        }
      }
    }

    return alternatives.slice(0, 5); // Limit to 5 suggestions
  }

  /**
   * Prunes XML by keeping only interactive/identifiable elements.
   * Removes decorative/layout-only nodes to prevent LLM context overflow.
   * Production apps can have 500-2000 XML nodes — this reduces to ~50-100 relevant ones.
   */
  private pruneXml(xml: string): string {
    const lines = xml.split('\n');
    const prunedLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Always keep the root hierarchy element
      if (trimmed.startsWith('<?xml') || trimmed.startsWith('<hierarchy') || trimmed.startsWith('</hierarchy')) {
        prunedLines.push(line);
        continue;
      }

      // Keep elements that have any identifiable/interactive attribute
      const hasIdentity = /content-desc="[^"]+"|resource-id="[^"]+"|accessibility-id="[^"]+"|name="[^"]+"|text="[^"]+"/.test(trimmed);
      const isInteractive = /clickable="true"|checkable="true"|scrollable="true"|focusable="true"/.test(trimmed);
      const isVisible = /displayed="true"|visible="true"/.test(trimmed) || !trimmed.includes('visible="false"');

      // Keep closing tags for remaining elements
      const isClosingTag = trimmed.startsWith('</');

      if (hasIdentity || isInteractive || isClosingTag) {
        prunedLines.push(line);
      }
    }

    const pruned = prunedLines.join('\n');

    // Final safety cap at 8000 chars
    if (pruned.length > 8000) {
      return pruned.substring(0, 8000) + '\n<!-- ... truncated from ' + pruned.length + ' chars -->';
    }

    return pruned;
  }
}
