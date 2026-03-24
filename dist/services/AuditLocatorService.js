import path from 'path';
import { Project } from 'ts-morph';
import fs from 'fs/promises';
export class AuditLocatorService {
    /**
     * Scans all Page Objects in the project and audits their locator strategies.
     * Flags brittle XPaths and generates a Markdown report with recommendations.
     */
    async audit(projectRoot, pagesRoot = 'pages') {
        const pagesDir = path.join(projectRoot, pagesRoot);
        const pageFiles = await this.listTsFiles(pagesDir);
        const entries = [];
        if (pageFiles.length > 0) {
            const project = new Project({ compilerOptions: { strict: false }, skipAddingFilesFromTsConfig: true });
            for (const f of pageFiles) {
                project.addSourceFileAtPath(f);
            }
            for (const sourceFile of project.getSourceFiles()) {
                for (const cls of sourceFile.getClasses()) {
                    const className = cls.getName() ?? 'AnonymousClass';
                    const relPath = path.relative(projectRoot, sourceFile.getFilePath());
                    // Scan getters
                    for (const getter of cls.getGetAccessors()) {
                        const body = getter.getBody()?.getText() ?? '';
                        const match = body.match(/\$\(\s*['"`](.+?)['"`]\s*\)/);
                        if (match) {
                            entries.push(this.classifyEntry(relPath, className, getter.getName(), match[1]));
                        }
                    }
                    // Scan properties  
                    for (const prop of cls.getProperties()) {
                        const initializer = prop.getInitializer()?.getText() ?? '';
                        const match = initializer.match(/\$\(\s*['"`](.+?)['"`]\s*\)/);
                        if (match) {
                            entries.push(this.classifyEntry(relPath, className, prop.getName(), match[1]));
                        }
                    }
                    // Scan method bodies for inline selectors
                    for (const method of cls.getMethods()) {
                        const body = method.getBody()?.getText() ?? '';
                        const inlineMatches = body.matchAll(/\$\(\s*['"`](.+?)['"`]\s*\)/g);
                        for (const m of inlineMatches) {
                            entries.push(this.classifyEntry(relPath, className, `${method.getName()}() inline`, m[1]));
                        }
                    }
                }
            }
        }
        // Also scan YAML locator files (e.g., locators/*.yaml) — common in non-POM projects
        const yamlDirs = [
            path.join(projectRoot, 'locators'),
            path.join(projectRoot, 'src', 'locators'),
            path.join(projectRoot, 'test-data', 'locators')
        ];
        for (const yamlDir of yamlDirs) {
            const yamlFiles = await this.listFiles(yamlDir, ['.yaml', '.yml']);
            for (const yamlFile of yamlFiles) {
                const relPath = path.relative(projectRoot, yamlFile);
                const content = await fs.readFile(yamlFile, 'utf8');
                const yamlEntries = this.extractYamlLocators(content, relPath);
                entries.push(...yamlEntries);
            }
        }
        const accessibilityIdCount = entries.filter(e => e.strategy === 'accessibility-id').length;
        const xpathCount = entries.filter(e => e.strategy === 'xpath').length;
        const otherCount = entries.length - accessibilityIdCount - xpathCount;
        const report = {
            totalLocators: entries.length,
            accessibilityIdCount,
            xpathCount,
            otherCount,
            entries,
            markdownReport: this.generateMarkdownReport(entries, accessibilityIdCount, xpathCount, otherCount)
        };
        return report;
    }
    classifyEntry(file, className, locatorName, selector) {
        let strategy;
        let severity;
        let recommendation;
        if (selector.startsWith('~')) {
            strategy = 'accessibility-id';
            severity = 'ok';
            recommendation = '✅ Stable — accessibility-id is the preferred strategy.';
        }
        else if (selector.startsWith('//')) {
            strategy = 'xpath';
            severity = 'critical';
            recommendation = '🔴 BRITTLE — XPath will break on UI changes. Add testID/accessibility-id to the app source.';
        }
        else if (selector.includes(':id/')) {
            strategy = 'resource-id';
            severity = 'warning';
            recommendation = '🟡 Acceptable — resource-id is stable but prefer accessibility-id for cross-platform.';
        }
        else if (selector.startsWith('-ios')) {
            strategy = 'ios-predicate';
            severity = 'warning';
            recommendation = '🟡 iOS only — consider adding accessibility-id for cross-platform support.';
        }
        else {
            strategy = 'other';
            severity = 'warning';
            recommendation = '🟡 Unknown strategy — verify this locator is stable across releases.';
        }
        return { file, className, locatorName, strategy, selector, severity, recommendation };
    }
    generateMarkdownReport(entries, accessibilityIdCount, xpathCount, otherCount) {
        const lines = [
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
    /**
     * Extracts locator selectors from YAML content.
     * Supports patterns like:
     *   loginButton:
     *     android: ~login_btn
     *     ios: ~loginButton
     * Or flat: loginButton: "~login_btn"
     */
    extractYamlLocators(content, filePath) {
        const yamlEntries = [];
        let currentKey = 'unknown';
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            // Detect a top-level key name (locator identifier)
            const keyMatch = trimmed.match(/^([\w][\w.-]*):$/);
            if (keyMatch && keyMatch[1]) {
                currentKey = keyMatch[1];
                continue;
            }
            // Detect platform-specific selector values: android: ~selector or ios: //xpath
            const platformMatch = trimmed.match(/^(android|ios|selector|locator|value)\s*:\s*['"]?([~#/][^'"\s]+|.*?:id\/[^'"\s]+)['"]?$/);
            if (platformMatch && platformMatch[2]) {
                yamlEntries.push(this.classifyEntry(filePath, 'YAML', `${currentKey}.${platformMatch[1]}`, platformMatch[2]));
                continue;
            }
            // Handle flat format: loginButton: "~login_btn"
            const flatMatch = trimmed.match(/^([\w][\w.-]*):\s+['"]?([~#/][^'"\s]+|.*?:id\/[^'"\s]+)['"]?$/);
            if (flatMatch && flatMatch[1] && flatMatch[2]) {
                yamlEntries.push(this.classifyEntry(filePath, 'YAML', flatMatch[1], flatMatch[2]));
            }
        }
        return yamlEntries;
    }
    async listTsFiles(dir) {
        return this.listFiles(dir, ['.ts']);
    }
    async listFiles(dir, extensions) {
        let results = [];
        try {
            const dirEntries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of dirEntries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    results = results.concat(await this.listFiles(fullPath, extensions));
                }
                else if (extensions.some(ext => entry.name.endsWith(ext))) {
                    results.push(fullPath);
                }
            }
        }
        catch {
            // Directory doesn't exist
        }
        return results;
    }
}
