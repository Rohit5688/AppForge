import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
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
            const runTimeout = options?.testRunTimeout ?? 300000; // 5 min default
            let rawStdout = '';
            let rawStderr = '';
            let timedOut = false;
            try {
                const result = await execAsync(command, {
                    cwd: projectRoot,
                    env: { ...process.env, FORCE_COLOR: '0' },
                    timeout: runTimeout
                });
                rawStdout = result.stdout;
                rawStderr = result.stderr;
            }
            catch (innerError) {
                if (innerError.killed || innerError.signal === 'SIGTERM')
                    timedOut = true;
                throw innerError; // re-throw for outer catch
            }
            const fullLog = rawStdout + rawStderr;
            const artifactPath = this.writeOutputArtifact(projectRoot, 'pass', fullLog);
            const { output, truncated } = this.compactOutput(fullLog);
            let stats;
            try {
                stats = await this.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
            }
            catch {
                stats = { total: 0, passed: 0, failed: 0, skipped: 0, totalDurationMs: 0, scenarios: [] };
            }
            return {
                success: true,
                output,
                outputTruncated: truncated,
                outputArtifactPath: artifactPath,
                timedOut: false,
                exitCode: 0,
                reportPath: path.join(projectRoot, 'reports', 'cucumber-results.json'),
                stats
            };
        }
        catch (error) {
            const timedOut = !!(error.killed || error.signal === 'SIGTERM');
            const fullLog = (error.stdout || '') + (error.stderr || error.message || '');
            const artifactPath = this.writeOutputArtifact(projectRoot, 'fail', fullLog);
            const { output, truncated } = this.compactOutput(fullLog);
            let stats;
            try {
                stats = await this.parseReport(path.join(projectRoot, 'reports', 'cucumber-results.json'));
            }
            catch {
                stats = { total: 0, passed: 0, failed: 0, skipped: 0, totalDurationMs: 0, scenarios: [] };
            }
            // Auto-capture failure context from live session — write to disk, never inline
            let failureContext;
            if (this.sessionService?.isSessionActive()) {
                try {
                    const screenshotBase64 = await this.sessionService.takeScreenshot();
                    const pageSourceXml = await this.sessionService.getPageSource();
                    const timestamp = new Date().toISOString();
                    const reportsDir = path.join(projectRoot, 'reports', 'appforge');
                    fs.mkdirSync(reportsDir, { recursive: true });
                    const tag = timestamp.replace(/[:.]/g, '-');
                    const screenshotPath = path.join(reportsDir, `failure-screenshot-${tag}.png`);
                    const pageSourcePath = path.join(reportsDir, `failure-pagesource-${tag}.xml`);
                    fs.writeFileSync(screenshotPath, Buffer.from(screenshotBase64, 'base64'));
                    fs.writeFileSync(pageSourcePath, pageSourceXml, 'utf8');
                    failureContext = { screenshotPath, pageSourcePath, timestamp };
                }
                catch {
                    // Session may have died during test — ignore
                }
            }
            const timeoutSec = Math.round((options?.testRunTimeout ?? 300000) / 1000);
            return {
                success: false,
                output,
                outputTruncated: truncated,
                outputArtifactPath: artifactPath,
                timedOut,
                exitCode: error.code ?? 1,
                error: timedOut
                    ? `Test run timed out after ${timeoutSec}s. Full log at: ${artifactPath}`
                    : error.message,
                stats,
                failureContext
            };
        }
    }
    /**
     * LS-13: Truncates raw WDIO log to last 40 lines or 8 KB, whichever is smaller.
     * Returns { output: truncated tail, truncated: boolean }.
     */
    compactOutput(raw, maxLines = 40, maxBytes = 8192) {
        const lines = raw.split('\n');
        const tail = lines.slice(-maxLines).join('\n');
        const capped = tail.length > maxBytes ? tail.slice(-maxBytes) : tail;
        return { output: capped, truncated: lines.length > maxLines || raw.length > maxBytes };
    }
    /**
     * LS-13: Persists full WDIO log to .../reports/appforge/run-{timestamp}.log
     * Returns artifact path for reference in tool responses.
     */
    writeOutputArtifact(projectRoot, tag, content) {
        try {
            const dir = path.join(projectRoot, 'reports', 'appforge');
            fs.mkdirSync(dir, { recursive: true });
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const filePath = path.join(dir, `run-${tag}-${ts}.log`);
            fs.writeFileSync(filePath, content, 'utf8');
            return filePath;
        }
        catch {
            return '';
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
        try {
            // Safe, fast regex: match opening bracket, tag name, and lazily capture up to the closing bracket.
            // Limits attribute block to 15,000 chars to avoid catastrophic CPU hang on broken iOS simulator dumps.
            const nodeRegex = /<([a-zA-Z0-9\._\-]+)([^>]{0,15000})>/g;
            let match;
            while ((match = nodeRegex.exec(xml)) !== null) {
                const tag = match[1];
                const attrs = match[2];
                // Safely extract attributes using focused non-backtracking regexes
                const idMatch = attrs.match(/(?:resource-id|content-desc|accessibility-id|name)="([^"]{0,1000})"/);
                const textMatch = attrs.match(/text="([^"]{0,2000})"/);
                const boundsMatch = attrs.match(/bounds="([^"]{0,200})"/);
                const clickableMatch = attrs.match(/clickable="true"/);
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
        }
        catch (e) {
            console.error('[AppForge] XML parsing error (likely malformed UI hierarchy tree):', e.message);
        }
        return elements;
    }
    /**
     * Parses Cucumber JSON report for structured test stats including scenario-level details.
     */
    async parseReport(reportPath) {
        try {
            const { readFile } = await import('fs/promises');
            const raw = await readFile(reportPath, 'utf8');
            const features = JSON.parse(raw);
            let total = 0, passed = 0, failed = 0, skipped = 0;
            let totalDurationMs = 0;
            const scenarios = [];
            for (const feature of features) {
                for (const scenario of (feature.elements ?? [])) {
                    if (scenario.type !== 'scenario')
                        continue;
                    total++;
                    let status = 'unknown';
                    let durationMs = 0;
                    let errorMessage;
                    const steps = scenario.steps ?? [];
                    for (const step of steps) {
                        const stepDuration = step.result?.duration ?? 0;
                        // Cucumber JSON duration is usually in nanoseconds
                        durationMs += Math.round(stepDuration / 1_000_000);
                        if (step.result?.error_message && !errorMessage) {
                            errorMessage = step.result.error_message;
                        }
                    }
                    if (steps.some((s) => s.result?.status === 'failed')) {
                        failed++;
                        status = 'failed';
                    }
                    else if (steps.some((s) => s.result?.status === 'skipped' || s.result?.status === 'undefined' || s.result?.status === 'pending')) {
                        skipped++;
                        status = 'skipped';
                    }
                    else if (steps.length > 0) {
                        passed++;
                        status = 'passed';
                    }
                    totalDurationMs += durationMs;
                    scenarios.push({
                        id: scenario.id,
                        name: scenario.name,
                        feature: feature.name,
                        status,
                        durationMs,
                        error: errorMessage
                    });
                }
            }
            return { total, passed, failed, skipped, totalDurationMs, scenarios };
        }
        catch {
            return undefined;
        }
    }
}
