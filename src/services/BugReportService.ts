/**
 * BugReportService — Generates structured bug reports from test failures.
 * Supports Jira-style format with reproduction steps, expected/actual, 
 * and references to Appium logs, screenshots, and XML hierarchy.
 */
export class BugReportService {

  /**
   * Generates a Jira-formatted bug report from a failed Appium test.
   */
  public generateBugReport(
    testName: string,
    rawError: string,
    platform?: string,
    deviceName?: string,
    appVersion?: string
  ): string {
    const severity = this.classifySeverity(rawError);
    const errorSummary = this.extractErrorSummary(rawError);
    const timestamp = new Date().toISOString();

    return `## 🐛 Bug Report — ${testName}

**Priority**: ${severity.priority}
**Severity**: ${severity.level}
**Component**: Mobile / ${platform ?? 'Unknown Platform'}
**Device**: ${deviceName ?? 'Unknown Device'}
**App Version**: ${appVersion ?? 'Unknown'}
**Reported**: ${timestamp}

---

### Summary
${errorSummary}

### Steps to Reproduce
> Automated test: \`${testName}\`

1. Launch the application on ${platform ?? 'device'}
2. Execute the test scenario described above
3. Observe the failure at the step indicated in the error log

### Expected Result
The test scenario should complete without errors.

### Actual Result
\`\`\`
${rawError.substring(0, 2000)}
\`\`\`
${rawError.length > 2000 ? '\n_(truncated — full log attached)_' : ''}

### Environment
| Key | Value |
|-----|-------|
| Platform | ${platform ?? 'N/A'} |
| Device | ${deviceName ?? 'N/A'} |
| App Version | ${appVersion ?? 'N/A'} |
| Test Framework | Cucumber + WebdriverIO |
| Automation | Appium |

### Attachments
- [ ] Appium server log
- [ ] Device screenshot at failure
- [ ] XML page source at failure
- [ ] Test execution report (\`reports/cucumber-report.json\`)

### Root Cause Analysis
${severity.analysis}
`;
  }

  private classifySeverity(error: string): { priority: string; level: string; analysis: string } {
    const lower = error.toLowerCase();

    if (lower.includes('crash') || lower.includes('anr') || lower.includes('fatal')) {
      return { priority: 'P0 — Blocker', level: 'Critical', analysis: 'The application appears to have crashed or become unresponsive. This needs immediate investigation.' };
    }
    if (lower.includes('element not found') || lower.includes('nosuchelement') || lower.includes('element could not be located')) {
      return { priority: 'P2 — Major', level: 'Major', analysis: 'A UI element was not found. This could be a locator change after an app update, or the element is loading slower than the timeout allows.' };
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return { priority: 'P2 — Major', level: 'Major', analysis: 'A timeout occurred. The element or action took longer than expected. Consider increasing timeouts or investigating performance.' };
    }
    if (lower.includes('assertion') || lower.includes('expected') || lower.includes('to equal') || lower.includes('to contain')) {
      return { priority: 'P3 — Minor', level: 'Minor', analysis: 'An assertion failed. The application returned unexpected data. This may indicate a data/logic bug in the app.' };
    }
    return { priority: 'P2 — Major', level: 'Major', analysis: 'Unable to auto-classify. Manual investigation recommended.' };
  }

  private extractErrorSummary(error: string): string {
    const lines = error.split('\n').filter(l => l.trim().length > 0);
    // Try to find the most relevant error line
    const errorLine = lines.find(l =>
      l.includes('Error:') || l.includes('FAILED') || l.includes('AssertionError') || l.includes('NoSuchElement')
    );
    return errorLine ?? lines[0] ?? 'Test failed with no clear error message.';
  }
}
