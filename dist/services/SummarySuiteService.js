import fs from 'fs/promises';
import path from 'path';
import { McpConfigService } from './McpConfigService.js';
export class SummarySuiteService {
    configService;
    constructor() {
        this.configService = new McpConfigService();
    }
    /**
     * Auto-detects the report file path from common locations
     */
    async autoDetectReportPath(projectRoot, configuredPath) {
        // Priority order for report detection
        const possiblePaths = [
            configuredPath, // Highest priority: explicitly configured
            'reports/cucumber-results.json',
            'reports/cucumber-report.json',
            'reports/cucumber.json',
            'cucumber-report.json',
            'allure-results/cucumber.json',
            'test-results/cucumber.json',
            'wdio-reports/cucumber.json'
        ].filter(Boolean);
        for (const relativePath of possiblePaths) {
            const fullPath = path.join(projectRoot, relativePath);
            try {
                await fs.access(fullPath);
                return relativePath;
            }
            catch {
                // File doesn't exist, try next
            }
        }
        return null;
    }
    /**
     * Detects the report format (standard Cucumber JSON or WebdriverIO format)
     */
    detectReportFormat(features) {
        if (!Array.isArray(features) || features.length === 0) {
            return 'unknown';
        }
        const firstFeature = features[0];
        const firstElement = firstFeature.elements?.[0];
        // WebdriverIO format typically has 'id' field on both feature and elements
        if (firstFeature.id && firstElement?.id) {
            return 'wdio';
        }
        // Standard Cucumber format has 'type' or 'keyword' fields
        if (firstElement?.type || firstElement?.keyword) {
            return 'cucumber';
        }
        // Default to cucumber if structure looks valid
        if (firstFeature.elements && Array.isArray(firstFeature.elements)) {
            return 'cucumber';
        }
        return 'unknown';
    }
    /**
     * Parses a Cucumber JSON report and generates a plain-English summary.
     * Supports both standard Cucumber JSON and WebdriverIO Cucumber formats.
     * Auto-detects report path if not specified.
     */
    async summarize(projectRoot, reportFile) {
        // Try to load config for custom report path
        let configuredReportPath;
        try {
            const config = this.configService.read(projectRoot);
            configuredReportPath = config.execution?.reportPath ||
                path.join(config.paths?.reportsRoot || 'reports', 'cucumber-results.json');
        }
        catch {
            // Config not found or invalid, will use defaults
        }
        // Auto-detect report path if not explicitly provided
        let finalReportFile = reportFile;
        if (!finalReportFile) {
            const detected = await this.autoDetectReportPath(projectRoot, configuredReportPath);
            if (detected) {
                finalReportFile = detected;
            }
            else {
                finalReportFile = configuredReportPath || 'reports/cucumber-results.json';
            }
        }
        const reportPath = path.join(projectRoot, finalReportFile);
        let features = [];
        try {
            const raw = await fs.readFile(reportPath, 'utf8');
            features = JSON.parse(raw);
        }
        catch {
            return {
                totalFeatures: 0,
                totalScenarios: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                duration: '0s',
                failedScenarios: [],
                plainEnglishSummary: `No test report found at ${reportPath}. Run tests first with run_cucumber_test.`
            };
        }
        let totalScenarios = 0;
        let passed = 0;
        let failed = 0;
        let skipped = 0;
        let totalDurationNs = 0;
        const failedScenarios = [];
        // Detect format for better parsing
        const format = this.detectReportFormat(features);
        for (const feature of features) {
            for (const element of (feature.elements ?? [])) {
                // For WebdriverIO format, all elements are scenarios (no type/keyword needed)
                // For standard Cucumber, check type/keyword to filter out hooks/backgrounds
                let isScenario = true;
                if (format === 'cucumber') {
                    isScenario = element.type?.toLowerCase() === 'scenario' ||
                        element.keyword?.toLowerCase().includes('scenario');
                }
                // For WebdriverIO, we assume all elements are scenarios unless explicitly marked otherwise
                else if (format === 'wdio') {
                    // WebdriverIO elements are scenarios by default, but exclude if type is explicitly 'background' or 'hook'
                    if (element.type && !element.type.toLowerCase().includes('scenario')) {
                        isScenario = false;
                    }
                }
                if (!isScenario)
                    continue;
                totalScenarios++;
                const steps = element.steps ?? [];
                let scenarioDuration = 0;
                let scenarioFailed = false;
                let failureError = '';
                for (const step of steps) {
                    scenarioDuration += step.result?.duration ?? 0;
                    if (step.result?.status === 'failed') {
                        scenarioFailed = true;
                        failureError = step.result?.error_message ?? 'Unknown error';
                    }
                }
                totalDurationNs += scenarioDuration;
                if (scenarioFailed) {
                    failed++;
                    failedScenarios.push({
                        name: element.name ?? 'Unnamed scenario',
                        error: failureError.substring(0, 200) // Truncate long errors
                    });
                }
                else if (steps.some((s) => s.result?.status === 'skipped' || s.result?.status === 'undefined')) {
                    skipped++;
                }
                else {
                    passed++;
                }
            }
        }
        // Auto-detect unit: WDIO cucumber reporter uses ms, native cucumber uses ns
        const durationSec = totalDurationNs > 10_000_000
            ? Math.round(totalDurationNs / 1_000_000_000)
            : Math.round(totalDurationNs / 1_000);
        const durationStr = durationSec > 60
            ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`
            : `${durationSec}s`;
        // Build plain-English summary
        const summaryParts = [];
        if (failed === 0 && skipped === 0) {
            summaryParts.push(`✅ All ${totalScenarios} scenarios passed across ${features.length} features in ${durationStr}.`);
        }
        else {
            summaryParts.push(`Ran ${totalScenarios} scenarios across ${features.length} features in ${durationStr}.`);
            summaryParts.push(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped.`);
        }
        if (failedScenarios.length > 0) {
            summaryParts.push('');
            summaryParts.push('Failed scenarios:');
            for (const fs of failedScenarios) {
                summaryParts.push(`  ❌ ${fs.name}: ${fs.error.split('\n')[0]}`);
            }
        }
        return {
            totalFeatures: features.length,
            totalScenarios,
            passed,
            failed,
            skipped,
            duration: durationStr,
            failedScenarios,
            plainEnglishSummary: summaryParts.join('\n')
        };
    }
}
