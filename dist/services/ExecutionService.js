import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { McpConfigService } from './McpConfigService.js';
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
export class ExecutionService {
    sessionService = null;
    /** Inject a live session service for auto-fetch capabilities. */
    setSessionService(service) {
        this.sessionService = service;
    }
    /**
     * Validates Cucumber tag expression against an allowlist.
     * Issue #17: Prevent shell injection via unsanitised tags parameter.
     * Valid characters: @, alphanumeric, spaces, parentheses, logical operators (!, &, |, comma)
     */
    validateTagExpression(tags) {
        if (!tags || tags.trim() === '')
            return true; // Empty is OK
        // Allowlist: @ (tag prefix), word chars, spaces, brackets, and logical operators
        const allowedPattern = /^[@\w\s()!&|,]+$/;
        return allowedPattern.test(tags);
    }
    /**
     * Rejects specificArgs containing shell metacharacters.
     * Issue #17: Prevent shell injection via unescaped specificArgs.
     */
    validateSpecificArgs(args) {
        if (!args || args.trim() === '')
            return true; // Empty is OK
        // Reject anything containing shell metacharacters: ; & | ` $ > < ' " \ ! and newlines
        const forbiddenPattern = /[;&|`$><'"\\!\n\r]/;
        return !forbiddenPattern.test(args);
    }
    /**
     * Executes Cucumber Appium tests with tag and platform filtering.
     * If a live session is active and tests fail, auto-captures screenshot + XML for healing.
     *
     * Issue #17 FIX:
     * - Validates tags against allowlist: only @, word chars, spaces, brackets, logical operators
     * - Rejects specificArgs containing shell metacharacters (; & | ` $ > < ' " \ !)
     * - Uses execFile with args array instead of execAsync(string) to eliminate shell interpolation
     *
     * Timeout FIX:
     * - Supports configurable timeout with resolution order:
     *   1. Explicit timeoutMs parameter
     *   2. mcp-config.json execution.timeoutMs
     *   3. Detected from playwright.config.ts (if present)
     *   4. Default: 30 minutes (1800000 ms)
     */
    async runTest(projectRoot, options) {
        try {
            // Issue #17: Validate tag expression and specific args upfront
            if (options?.tags && !this.validateTagExpression(options.tags)) {
                return {
                    success: false,
                    output: '',
                    error: `Invalid tag expression: "${options.tags}". Tags must only contain alphanumeric characters, @, spaces, parentheses, and logical operators (!, &, |, comma).`
                };
            }
            if (options?.specificArgs && !this.validateSpecificArgs(options.specificArgs)) {
                return {
                    success: false,
                    output: '',
                    error: `Invalid specificArgs: "${options.specificArgs}". Arguments must not contain shell metacharacters (;, &, |, backtick, $, >, <, quotes, backslash, !).`
                };
            }
            const configService = new McpConfigService();
            let config;
            try {
                config = configService.read(projectRoot);
            }
            catch {
                config = null;
            }
            // Resolve timeout with priority: explicit > config > detect > default
            const timeout = await this.resolveTimeout(projectRoot, options?.timeoutMs, config);
            const fs = await import('fs');
            let command = '';
            if (options?.overrideCommand) {
                // Issue #17: Validate overrideCommand doesn't contain obvious injection attempts
                if (/[;&|`$]/.test(options.overrideCommand)) {
                    return {
                        success: false,
                        output: '',
                        error: `Invalid overrideCommand: contains shell metacharacters. Use executionCommand in mcp-config.json instead.`
                    };
                }
                command = options.overrideCommand;
            }
            else if (config?.project?.executionCommand) {
                command = config.project.executionCommand;
            }
            else {
                const defaultConf = fs.existsSync(path.join(projectRoot, 'wdio.conf.ts'))
                    ? 'wdio.conf.ts' : 'wdio.conf.js';
                command = `npx wdio run ${defaultConf}`;
                console.warn(`[AppForge] ⚠️ No executionCommand in mcp-config.json — using default: ${command}`);
            }
            // We only append specific arguments if we're dealing with a wdio execution command natively
            // Otherwise we just run the custom execution command as-is
            if (!command)
                throw new Error("Missing execution command.");
            // Issue #17 FIX: Parse command into executable + args, then build args array
            const parts = command.split(/\s+/).filter(p => p.length > 0);
            const exe = parts.shift(); // Get first part (e.g., 'npx')
            if (!exe)
                throw new Error("Invalid execution command.");
            // Additional safety: validate executable name doesn't contain path traversal
            if (exe.includes('..') || exe.includes('/') && !exe.startsWith('/')) {
                throw new Error("Invalid executable: must be a binary name or absolute path.");
            }
            const args = parts;
            let configName = 'wdio.conf.ts';
            const isWdio = command.includes('wdio');
            if (isWdio && options?.platform) {
                const specificConfig = `wdio.${options.platform}.conf.ts`;
                if (fs.existsSync(path.join(projectRoot, specificConfig))) {
                    configName = specificConfig;
                    // Replace generic wdio.conf.ts with specific if it exists in args
                    const index = args.findIndex(p => p.includes('wdio.conf.ts'));
                    if (index !== -1)
                        args[index] = specificConfig;
                }
            }
            // Apply tag filtering via wdio cucumberOpts
            let tagExpression = options?.tags || '';
            if (isWdio) {
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
                if (tagExpression) {
                    // Issue #17 FIX: Pass as separate arg (no shell quoting needed with execFile)
                    args.push(`--cucumberOpts.tagExpression=${tagExpression}`);
                }
                // Additional args (already validated)
                if (options?.specificArgs) {
                    // Split on spaces if multiple args were provided, filter empty strings
                    const additionalArgs = options.specificArgs.split(/\s+/).filter(arg => arg.length > 0);
                    args.push(...additionalArgs);
                }
            }
            // Issue #17 FIX: Use execFile with args array instead of shell string
            // Timeout FIX: Use resolved timeout
            const { stdout, stderr } = await execFileAsync(exe, args, {
                cwd: projectRoot,
                env: { ...process.env, FORCE_COLOR: '0' },
                timeout: timeout.value
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
                output: `[Timeout: ${timeout.value}ms (source: ${timeout.source})]\n\n${stdout + stderr}`,
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
     *
     * Issue #15 FIX: Now generates valid locatorStrategies for each element.
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
        // Parse the XML to extract interactable elements with valid locator strategies
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
     *
     * Issue #15 FIX: Generates valid WebdriverIO/Appium locator strategies.
     * Previously generated invalid `*[text()="..."]` selectors.
     * Now returns proper XPath, accessibility-id, and resource-id selectors.
     */
    parseXmlElements(xml) {
        const elements = [];
        // Simple regex-based extraction from XML (no external XML parser needed)
        // Matches: <TagName attrs... /> or <TagName attrs...>
        const nodeRegex = /<(\w+(?:\.\w+)*)\s+([^>]*?)\/?>/g;
        let match;
        while ((match = nodeRegex.exec(xml)) !== null) {
            const tag = match[1];
            const attrs = match[2];
            // Extract all relevant attributes
            const resourceIdMatch = attrs.match(/resource-id="([^"]*)"/);
            const contentDescMatch = attrs.match(/content-desc="([^"]*)"/);
            const accessibilityIdMatch = attrs.match(/accessibility-id="([^"]*)"/);
            const nameMatch = attrs.match(/name="([^"]*)"/);
            const textMatch = attrs.match(/(?:text|value)="([^"]*)"/);
            const boundsMatch = attrs.match(/bounds="([^"]*)"/);
            const clickableMatch = attrs.match(/clickable="true"/);
            const enabledMatch = attrs.match(/enabled="true"/);
            const classMatch = attrs.match(/class="([^"]*)"/);
            let boundsStr = boundsMatch?.[1] ?? '';
            if (!boundsStr) {
                const x = attrs.match(/x="([^"]*)"/)?.[1];
                const y = attrs.match(/y="([^"]*)"/)?.[1];
                const w = attrs.match(/width="([^"]*)"/)?.[1];
                const h = attrs.match(/height="([^"]*)"/)?.[1];
                if (x && y && w && h) {
                    boundsStr = `x=${x},y=${y},w=${w},h=${h}`;
                }
            }
            // Extract attribute values
            const resourceId = resourceIdMatch?.[1] ?? '';
            const contentDesc = contentDescMatch?.[1] ?? '';
            const accessibilityId = accessibilityIdMatch?.[1] ?? '';
            const name = nameMatch?.[1] ?? '';
            const text = textMatch?.[1] ?? '';
            const className = classMatch?.[1] ?? '';
            // Only include interactable or identifiable elements
            if (resourceId || contentDesc || accessibilityId || name || text || clickableMatch || boundsStr) {
                // Issue #15 FIX: Generate valid locator strategies in priority order
                const locatorStrategies = [];
                // Priority 1: Accessibility ID (most stable)
                if (contentDesc) {
                    locatorStrategies.push(`~${contentDesc}`);
                }
                if (accessibilityId) {
                    locatorStrategies.push(`~${accessibilityId}`);
                }
                if (name && !contentDesc && !accessibilityId) {
                    // iOS uses 'name' for accessibility
                    locatorStrategies.push(`~${name}`);
                }
                // Priority 2: Resource ID (stable on Android)
                if (resourceId) {
                    locatorStrategies.push(`id=${resourceId}`);
                }
                // Priority 3: XPath with text (less stable, but sometimes necessary)
                // Issue #15 FIX: Use valid XPath syntax instead of invalid *[text()="..."]
                if (text && text.trim().length > 0 && text.trim().length < 50) {
                    // Escape double quotes in text for XPath
                    const escapedText = text.replace(/"/g, '&quot;');
                    locatorStrategies.push(`//*[@text="${escapedText}"]`);
                }
                // Priority 4: XPath with content-desc
                if (contentDesc && contentDesc.trim().length > 0) {
                    const escapedDesc = contentDesc.replace(/"/g, '&quot;');
                    locatorStrategies.push(`//*[@content-desc="${escapedDesc}"]`);
                }
                // Priority 5: XPath with resource-id
                if (resourceId) {
                    locatorStrategies.push(`//*[@resource-id="${resourceId}"]`);
                }
                // Priority 6: Class-based selector (least stable, last resort)
                if (className && locatorStrategies.length === 0) {
                    locatorStrategies.push(`//${className}`);
                }
                elements.push({
                    tag,
                    id: resourceId || accessibilityId || contentDesc || name || '',
                    text: text || '',
                    bounds: boundsStr,
                    className,
                    contentDesc,
                    resourceId,
                    locatorStrategies
                });
            }
        }
        return elements;
    }
    /**
     * Resolves the timeout value for test execution.
     * Priority: explicit param > mcp-config > detect from project > default (30 min)
     */
    async resolveTimeout(projectRoot, explicitTimeoutMs, config) {
        // 1. Explicit parameter
        if (explicitTimeoutMs !== undefined && explicitTimeoutMs !== null) {
            if (typeof explicitTimeoutMs !== 'number' || explicitTimeoutMs <= 0) {
                throw new Error(`Invalid timeoutMs: must be a positive number, got ${explicitTimeoutMs}`);
            }
            // Cap at 2 hours for safety
            const cappedTimeout = Math.min(explicitTimeoutMs, 7200000);
            if (cappedTimeout !== explicitTimeoutMs) {
                console.warn(`[AppForge] ⚠️ Timeout capped at 2 hours (7200000ms). Requested: ${explicitTimeoutMs}ms`);
            }
            return { value: cappedTimeout, source: 'explicit' };
        }
        // 2. mcp-config.json
        if (config?.execution?.timeoutMs) {
            const configTimeout = config.execution.timeoutMs;
            if (typeof configTimeout === 'number' && configTimeout > 0) {
                const cappedTimeout = Math.min(configTimeout, 7200000);
                return { value: cappedTimeout, source: 'mcp-config' };
            }
        }
        // 3. Detect from project (playwright.config.ts/js or package.json)
        const detectedTimeout = await this.detectProjectTimeout(projectRoot);
        if (detectedTimeout) {
            return { value: detectedTimeout, source: 'detected(playwright.config)' };
        }
        // 4. Default: 30 minutes
        return { value: 1800000, source: 'default' };
    }
    /**
     * Attempts to detect timeout from playwright.config.ts/js.
     * Best-effort detection using regex patterns.
     */
    async detectProjectTimeout(projectRoot) {
        try {
            const fs = await import('fs');
            const path = await import('path');
            // Check for playwright.config.ts or playwright.config.js
            const configFiles = ['playwright.config.ts', 'playwright.config.js'];
            for (const configFile of configFiles) {
                const configPath = path.default.join(projectRoot, configFile);
                if (!fs.default.existsSync(configPath))
                    continue;
                const content = fs.default.readFileSync(configPath, 'utf8');
                // Look for timeout: <number> pattern
                const timeoutMatch = content.match(/timeout\s*:\s*(\d+)/);
                if (timeoutMatch) {
                    const timeout = parseInt(timeoutMatch[1], 10);
                    if (timeout > 0) {
                        console.log(`[AppForge] ℹ️ Detected timeout from ${configFile}: ${timeout}ms`);
                        return timeout;
                    }
                }
                // Look for expect.timeout or testTimeout
                const expectTimeoutMatch = content.match(/(?:expect\.timeout|testTimeout)\s*:\s*(\d+)/);
                if (expectTimeoutMatch) {
                    const timeout = parseInt(expectTimeoutMatch[1], 10);
                    if (timeout > 0) {
                        console.log(`[AppForge] ℹ️ Detected timeout from ${configFile}: ${timeout}ms`);
                        return timeout;
                    }
                }
            }
            return null;
        }
        catch (error) {
            // Fail silently and fall back to default
            return null;
        }
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
