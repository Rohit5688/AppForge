import fs from 'fs';
import path from 'path';

export interface LearningRule {
  id: string;
  pattern: string;
  solution: string;
  tags: string[];
  timestamp: string;
}

export interface LearningSchema {
  version: string;
  rules: LearningRule[];
}

/**
 * LearningService — Persistent knowledge brain for the Appium MCP server.
 * Stores team-specific patterns and fixes that the AI should always apply.
 * Injected into generation prompts to prevent repeat mistakes.
 */
export class LearningService {

  private getStoragePath(projectRoot: string): string {
    const dir = path.join(projectRoot, '.appium-mcp');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, 'mcp-learning.json');
  }

  /** Reads all stored knowledge. */
  public getKnowledge(projectRoot: string): LearningSchema {
    const storagePath = this.getStoragePath(projectRoot);
    if (!fs.existsSync(storagePath)) {
      return { version: '1.0.0', rules: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    } catch {
      return { version: '1.0.0', rules: [] };
    }
  }

  /** Learns a new pattern → solution mapping and persists it. */
  public learn(projectRoot: string, pattern: string, solution: string, tags: string[] = []): LearningRule {
    const knowledge = this.getKnowledge(projectRoot);

    // Prevent exact duplicates
    const existing = knowledge.rules.find(r => r.pattern === pattern && r.solution === solution);
    if (existing) return existing;

    const newRule: LearningRule = {
      id: `rule-${Date.now()}`,
      pattern,
      solution,
      tags,
      timestamp: new Date().toISOString()
    };

    knowledge.rules.push(newRule);
    fs.writeFileSync(this.getStoragePath(projectRoot), JSON.stringify(knowledge, null, 2), 'utf8');
    return newRule;
  }

  /** Deletes a specific rule by ID. */
  public forget(projectRoot: string, ruleId: string): boolean {
    const knowledge = this.getKnowledge(projectRoot);
    const idx = knowledge.rules.findIndex(r => r.id === ruleId);
    if (idx === -1) return false;
    knowledge.rules.splice(idx, 1);
    fs.writeFileSync(this.getStoragePath(projectRoot), JSON.stringify(knowledge, null, 2), 'utf8');
    return true;
  }

  /**
   * Generates a prompt injection block containing all learned rules.
   * Injected into generation and healing prompts.
   */
  public getKnowledgePromptInjection(projectRoot: string): string {
    const knowledge = this.getKnowledge(projectRoot);
    if (knowledge.rules.length === 0) return '';

    let prompt = `\n### 🧠 CUSTOM TEAM KNOWLEDGE & LEARNED FIXES\n`;
    prompt += `IMPORTANT: You MUST adhere to the following learned rules. These are prior human-in-the-loop corrections or team standards that OVERRIDE ordinary behavior.\n\n`;

    knowledge.rules.forEach((rule, idx) => {
      prompt += `**Rule ${idx + 1}**: When you encounter: "${rule.pattern}"\n`;
      prompt += `-> **Action/Solution**: ${rule.solution}\n`;
      if (rule.tags.length > 0) prompt += `(Tags: ${rule.tags.join(', ')})\n`;
      prompt += `\n`;
    });

    return prompt;
  }

  /**
   * Exports the learning brain as a human-readable Markdown document.
   */
  public exportToMarkdown(projectRoot: string): string {
    const knowledge = this.getKnowledge(projectRoot);

    if (knowledge.rules.length === 0) {
      return '# Appium MCP — Team Knowledge Base\n\n_No rules learned yet. Use `train_on_example` to add patterns._\n';
    }

    let md = `# Appium MCP — Team Knowledge Base\n\n`;
    md += `**Version**: ${knowledge.version}\n`;
    md += `**Total Rules**: ${knowledge.rules.length}\n\n`;
    md += `| # | Pattern | Solution | Tags | Learned |\n`;
    md += `|---|---------|----------|------|--------|\n`;

    knowledge.rules.forEach((rule, idx) => {
      md += `| ${idx + 1} | ${rule.pattern} | ${rule.solution} | ${rule.tags.join(', ')} | ${rule.timestamp.split('T')[0]} |\n`;
    });

    return md;
  }
}
