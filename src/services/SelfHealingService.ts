export interface HealingInstruction {
  rootCause: 'locator' | 'sync' | 'app_bug';
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

import type { AppiumSessionService } from './AppiumSessionService.js';
import type { LearningService } from './LearningService.js';
import { ScreenshotStorage } from '../utils/ScreenshotStorage.js';

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

  /** Auto-learns a successful selector fix (12.10). */
  public reportHealSuccess(projectRoot: string, oldSelector: string, newSelector: string) {
    if (this.learningService) {
      this.learningService.learn(
        projectRoot,
        `Self-Heal Rule: Use \`${newSelector}\` instead of \`${oldSelector}\``,
        'auto_healed'
      );
    }
  }

  /**
   * Analyzes a Mobile Automation test failure using XML Hierarchy + Screenshots.
   * Parses the failure output to identify the broken selector, then scans XML for alternatives.
   * 
   * SCREENSHOT FIX: Now accepts screenshotPath instead of base64 to prevent context overflow.
   */
  public async analyzeMobileFailure(
    testOutput: string,
    xmlHierarchy: string,
    screenshotPath: string
  ): Promise<HealingInstruction> {
    // 1. Classify the root cause
    const isLocatorIssue = /NoSuchElementError|TimeoutError|element.*not.*found|stale element/i.test(testOutput);
    const isSyncIssue = /timeout|ETIMEDOUT|navigation timeout|waitFor/i.test(testOutput) && !isLocatorIssue;

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
   * Includes the XML tree, parsed elements, AND a reference to the screenshot file path.
   * 
   * SCREENSHOT FIX: Now references screenshot file path instead of embedding base64.
   */
  public buildVisionHealPrompt(
    instruction: HealingInstruction,
    xml: string,
    screenshotPath?: string
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

${screenshotPath ? `### 🖼️ VISION CONTEXT\nScreenshot saved at: ${screenshotPath}\nUse this for visual confirmation of the current device state.\n` : ''}
### 🎯 YOUR TASK
1. Analyze the XML hierarchy and the screenshot to find the element the test was trying to interact with.
2. Determine the BEST new selector. Use this priority: \`accessibility-id (~id)\` > \`resource-id\` > \`xpath\` > \`text\`.
3. Return ONLY a JSON object:
\`\`\`json
{
  "healedSelector": "~newAccessibilityId",
  "strategy": "accessibility-id",
  "confidence": "high|medium|low",
  "explanation": "Why this selector was chosen"
}
\`\`\`
`;
  }

  /**
   * Orchestrates a self-healing retry loop:
   * analyze failure → build heal prompt → (LLM heals) → rewrite → re-run
   * Returns the healing instruction for the LLM at each step.
   * 
   * SCREENSHOT FIX: Now uses screenshot storage instead of passing base64.
   */
  public async healWithRetry(
    testOutput: string,
    xmlHierarchy: string,
    screenshotPath: string,
    attempt: number = 1,
    maxAttempts: number = 3
  ): Promise<{ instruction: HealingInstruction; prompt: string; attempt: number; exhausted: boolean }> {
    // If live session is available, use fresh data instead of stale input
    let xml = xmlHierarchy;
    let screenshot = screenshotPath;
    if (this.sessionService?.isSessionActive()) {
      try {
        xml = await this.sessionService.getPageSource();
        const screenshotBase64 = await this.sessionService.takeScreenshot();
        // Store screenshot instead of passing base64
        const projectRoot = process.cwd();
        const storage = new ScreenshotStorage(projectRoot);
        const stored = storage.store(screenshotBase64, 'heal');
        screenshot = stored.relativePath;
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

  private findAlternatives(xml: string, failedSelector: string): string[] {
    const alternatives: string[] = [];
    if (!failedSelector || failedSelector === 'unknown') return alternatives;

    // Extract the "intent" from the failed selector (e.g., "apply" from "~credit_card_apply.button")
    const intentBase = failedSelector
      .replace(/^[~#/.]/, '')
      .replace(/^\/+/, '')
      .replace(/\[.*?\]/g, '')
      .toLowerCase();

    // Remove common prefixes/suffixes to get core identifying words
    const intent = intentBase
      .replace(/^(card[0-9]*|btn|button|lbl|label|txt|text|input|field)_/i, '')
      .replace(/[._-](btn|button|lbl|label|txt|text|input|field)$/i, '');

    const searchTerms = intent.split(/[._-]/).filter(p => p.length > 2);
    if (searchTerms.length === 0) searchTerms.push(intentBase);

    // Search XML for elements with matching content-desc, resource-id, text, name, label, or value
    const patterns = [
      /content-desc="([^"]*)"/g,
      /resource-id="([^"]*)"/g,
      /text="([^"]*)"/g,
      /accessibility-id="([^"]*)"/g,
      /name="([^"]*)"/g,
      /label="([^"]*)"/g,
      /value="([^"]*)"/g
    ];

    const seen = new Set<string>();

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(xml)) !== null) {
        const value = match[1];
        if (!value) continue;
        
        const lowerValue = value.toLowerCase();
        // Check if any significant search term is found in this XML attribute
        const matchesIntent = searchTerms.some(term => lowerValue.includes(term));

        if (matchesIntent && !seen.has(value)) {
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