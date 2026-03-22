import fs from 'fs/promises';
import path from 'path';
export class SummarySuiteService {
    /**
     * Parses a Cucumber JSON report and generates a plain-English summary.
     */
    async summarize(projectRoot, reportFile = 'reports/cucumber-results.json') {
        const reportPath = path.join(projectRoot, reportFile);
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
        for (const feature of features) {
            for (const element of (feature.elements ?? [])) {
                if (element.type !== 'scenario')
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
        const durationSec = Math.round(totalDurationNs / 1_000_000_000);
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
