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
            const fs = await import('fs');
            let configName = 'wdio.conf.ts';
            if (options?.platform) {
                const specificConfig = `wdio.${options.platform}.conf.ts`;
                if (fs.existsSync(path.join(projectRoot, specificConfig))) {
                    configName = specificConfig;
                }
            }
            let parts = [];
            if (options?.executionCommand) {
                parts = [options.executionCommand];
            }
            else {
                if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
                    parts = ['yarn', 'wdio', 'run', configName];
                }
                else if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
                    parts = ['pnpm', 'exec', 'wdio', 'run', configName];
                }
                else {
                    parts = ['npx', 'wdio', 'run', configName];
                }
            }
            let tagExpression = options?.tags || '';
            // If we fall back to generic monolithic config but user wants a specific platform,
            // we still need to filter via @android or @ios tags for the generic run to work correctly.
            if (options?.platform && configName === 'wdio.conf.ts') {
                const platformTag = `@${options.platform}`;
                if (tagExpression) {
                    tagExpression = `(${tagExpression}) and ${platformTag}`;
                }
                else {
                    tagExpression = platformTag;
                }
            }
            const hasExtraArgs = Boolean(tagExpression) || Boolean(options?.specificArgs);
            const isPackageRunner = parts.length > 0 && /^(npm|yarn|pnpm|bun)\s+run\b/.test(parts[0].trim());
            if (isPackageRunner && hasExtraArgs && !parts[0].includes(' -- ')) {
                parts.push('--');
            }
            if (tagExpression) {
                parts.push(`--cucumberOpts.tagExpression="${tagExpression}"`);
            }
            // Additional args
            if (options?.specificArgs) {
                parts.push(options.specificArgs);
            }
            const command = parts.join(' ');
            const runTimeout = options?.testRunTimeout ?? 300000; // 5 min default timeout for mobile
            const { stdout, stderr } = await execAsync(command, {
                cwd: projectRoot,
                env: { ...process.env, FORCE_COLOR: '0' },
                timeout: runTimeout
            });
            // Try to parse the JSON report for structured stats
            // wdio requires @wdio/cucumberjs-json-reporter to output this file.
            // If it doesn't exist, we gracefully fail and return 0s.
            let stats;
            try {
                stats = await this.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
            }
            catch {
                stats = { total: 0, passed: 0, failed: 0, skipped: 0 };
            }
            return {
                success: true,
                output: stdout + stderr,
                reportPath: path.join(projectRoot, 'reports', 'cucumber-results.json'),
                stats
            };
        }
        catch (error) {
            // Cucumber exits non-zero on test failures
            let stats;
            try {
                stats = await this.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
            }
            catch {
                stats = { total: 0, passed: 0, failed: 0, skipped: 0 };
            }
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
