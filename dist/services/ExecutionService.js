import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
const execAsync = promisify(exec);
export class ExecutionService {
    sessionService = null;
    /** Inject a live session service for auto-fetch capabilities. */
    setSessionService(service) {
        this.sessionService = service;
    }
    /**
     * Executes Cucumber Appium tests with tag and platform filtering.
     * If a live session is active and tests fail, auto-captures screenshot + XML for healing.
     */
    async runTest(projectRoot, options) {
        try {
            const parts = ['npx', 'cucumber-js'];
            // Apply tag filtering
            if (options?.tags) {
                parts.push(`--tags '${options.tags}'`);
            }
            // Apply platform filter as a tag
            if (options?.platform) {
                const platformTag = `@${options.platform}`;
                if (options?.tags) {
                    parts.push(`and '${platformTag}'`);
                }
                else {
                    parts.push(`--tags '${platformTag}'`);
                }
            }
            // JSON output for structured results
            parts.push('--format json:reports/cucumber-results.json');
            // Additional args
            if (options?.specificArgs) {
                parts.push(options.specificArgs);
            }
            const command = parts.join(' ');
            const { stdout, stderr } = await execAsync(command, {
                cwd: projectRoot,
                env: { ...process.env, FORCE_COLOR: '0' },
                timeout: 300000 // 5 min timeout
            });
            // Try to parse the JSON report for structured stats
            const stats = await this.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
            return {
                success: true,
                output: stdout + stderr,
                reportPath: path.join(projectRoot, 'reports', 'cucumber-results.json'),
                stats
            };
        }
        catch (error) {
            // Cucumber exits non-zero on test failures
            const stats = await this.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
            // Auto-capture failure context from live session if available
            let failureContext;
            if (this.sessionService?.isSessionActive()) {
                try {
                    failureContext = {
                        screenshot: await this.sessionService.takeScreenshot(),
                        pageSource: await this.sessionService.getPageSource(),
                        timestamp: new Date().toISOString()
                    };
                }
                catch {
                    // Session might have died during test — ignore
                }
            }
            return {
                success: false,
                output: error.stdout || '',
                error: error.stderr || error.message,
                stats,
                failureContext
            };
        }
    }
    /**
     * Captures UI Hierarchy (XML) and Screenshot (Base64) for Vision Healing.
     * If no xmlDump is provided and a live session exists, auto-fetches from the device.
     */
    async inspectHierarchy(xmlDump, screenshotBase64) {
        let xml = xmlDump ?? '';
        let screenshot = screenshotBase64 ?? '';
        let source = 'provided';
        // Auto-fetch from live session if no XML provided
        if (!xml && this.sessionService?.isSessionActive()) {
            xml = await this.sessionService.getPageSource();
            screenshot = await this.sessionService.takeScreenshot();
            source = 'live_session';
        }
        if (!xml) {
            throw new Error('No XML hierarchy provided and no active Appium session. ' +
                'Either provide xmlDump or call start_appium_session first.');
        }
        // Parse the XML to extract interactable elements
        const elements = this.parseXmlElements(xml);
        return {
            xml,
            screenshot,
            timestamp: new Date().toISOString(),
            elements,
            source
        };
    }
    /**
     * Extracts interactive elements from Appium XML page source.
     */
    parseXmlElements(xml) {
        const elements = [];
        // Simple regex-based extraction from XML (no external XML parser needed)
        const nodeRegex = /<(\w+\.?\w*)\s([^>]*?)\/?>/g;
        let match;
        while ((match = nodeRegex.exec(xml)) !== null) {
            const tag = match[1];
            const attrs = match[2];
            const idMatch = attrs.match(/(?:resource-id|content-desc|accessibility-id|name)="([^"]*)"/);
            const textMatch = attrs.match(/text="([^"]*)"/);
            const boundsMatch = attrs.match(/bounds="([^"]*)"/);
            const clickableMatch = attrs.match(/clickable="true"/);
            const enabledMatch = attrs.match(/enabled="true"/);
            // Only include interactable or identifiable elements
            if (idMatch || textMatch || clickableMatch) {
                elements.push({
                    tag,
                    id: idMatch?.[1] ?? '',
                    text: textMatch?.[1] ?? '',
                    bounds: boundsMatch?.[1] ?? ''
                });
            }
        }
        return elements;
    }
    /**
     * Parses Cucumber JSON report for structured test stats.
     */
    async parseReport(reportPath) {
        try {
            const { readFile } = await import('fs/promises');
            const raw = await readFile(reportPath, 'utf8');
            const features = JSON.parse(raw);
            let total = 0, passed = 0, failed = 0, skipped = 0;
            for (const feature of features) {
                for (const scenario of (feature.elements ?? [])) {
                    if (scenario.type !== 'scenario')
                        continue;
                    total++;
                    const steps = scenario.steps ?? [];
                    if (steps.some((s) => s.result?.status === 'failed')) {
                        failed++;
                    }
                    else if (steps.some((s) => s.result?.status === 'skipped' || s.result?.status === 'undefined')) {
                        skipped++;
                    }
                    else {
                        passed++;
                    }
                }
            }
            return { total, passed, failed, skipped };
        }
        catch {
            return undefined;
        }
    }
}
